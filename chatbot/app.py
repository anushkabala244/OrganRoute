import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="OrganRoute Assistant", version="1.0.0")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


class ChatResponse(BaseModel):
    reply: str
    source: str


FAQS = (
    (
        ("register", "sign up", "create account"),
        "Choose Register, select Patient / Family, Hospital Administrator, or "
        "Delivery Driver, and complete that account form. Verify the selected "
        "contact method. Hospital accounts also require platform administrator approval.",
    ),
    (
        ("verify", "verification", "otp", "code"),
        "Registration uses separate email and SMS verification codes. Codes "
        "expire, and you must verify both contacts before signing in.",
    ),
    (
        ("organ", "search", "availability"),
        "Sign in as Patient / Family, open New request, and choose an organ. "
        "The form shows verified hospitals reporting availability for that "
        "organ. This prototype does not determine medical eligibility or allocation.",
    ),
    (
        ("upload", "document", "documents", "pdf"),
        "In Patient / Family, open New request. You can preview and add a "
        "fictional sample PDF or upload a PDF, JPG, or PNG test file. Use "
        "fictional data only; never upload real patient records to this prototype.",
    ),
    (
        ("track", "tracking", "location"),
        "Sign in and open Requests in the patient dashboard to review each "
        "hospital response. If hospital delivery is approved, driver details "
        "and live location are shown after the driver starts the trip.",
    ),
    (
        ("delivery", "driver", "transport"),
        "After a hospital approves a request, the patient or family can choose "
        "self-delivery or hospital delivery. For hospital delivery, the hospital "
        "assigns an approved driver; tracking becomes available after departure.",
    ),
    (
        ("status", "request", "requests"),
        "Sign in and open Requests in your dashboard to review your request "
        "status. Status changes are managed by the authorised hospital account.",
    ),
    (
        ("route", "routing", "map", "distance"),
        "Open the Route Planner and select two different listed hospitals. "
        "It displays an estimated road route. Demo locations and estimates "
        "are not for real-world transport coordination.",
    ),
    (
        ("approval", "approved"),
        "Hospital accounts are reviewed by an administrator. The hospital "
        "dashboard is available after approval and verification.",
    ),
    (
        ("medical", "diagnosis", "treatment", "emergency", "donor", "eligibility"),
        "I can only help with OrganRoute platform features, not medical "
        "eligibility, diagnosis, treatment, allocation, or emergency decisions. "
        "Please contact a licensed healthcare professional or local emergency service.",
    ),
)


def faq_reply(message: str) -> str:
    lowered = message.lower()
    for keywords, answer in FAQS:
        if any(keyword in lowered for keyword in keywords):
            return answer
    return (
        "I can help with OrganRoute registration, verification, request status, "
        "hospital approval, and route-planner features. What would you like to know?"
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="A question is required.")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return ChatResponse(reply=faq_reply(message), source="faq")

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        completion = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are the OrganRoute platform assistant. Answer only "
                        "questions about using this software: accounts, verification, "
                        "requests, hospital approval, and route planning. Never give "
                        "medical advice or make recommendations about diagnosis, "
                        "treatment, donor eligibility, organ allocation, or clinical "
                        "transport. For those topics, direct users to licensed "
                        "healthcare professionals. Clarify that prototype data and "
                        "route estimates are not for clinical use."
                    ),
                },
                {"role": "user", "content": message},
            ],
            max_tokens=300,
        )
        answer: Optional[str] = completion.choices[0].message.content
        if not answer:
            raise RuntimeError("The assistant returned an empty response.")
        return ChatResponse(reply=answer, source="openai")
    except Exception as error:
        print(f"OpenAI assistant request failed: {error}")
        raise HTTPException(
            status_code=502,
            detail="The configured AI assistant could not answer right now.",
        ) from error
