import os
from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="OrganRoute Assistant", version="1.0.0")


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: List[ChatTurn] = Field(default_factory=list, max_length=12)


class ChatResponse(BaseModel):
    reply: str
    source: str


FAQS = (
    (
        ("register", "sign up", "create account"),
        "Choose Register and select Patient / Family or Hospital Administrator. "
        "Drivers are provisioned by their hospital, and platform administrators "
        "use a separate internal sign-in. Verify the contact method you select; "
        "hospital accounts also require platform approval.",
    ),
    (
        ("verify", "verification", "otp", "code"),
        "During registration, choose either email or SMS for verification. "
        "Only the selected contact method needs verification before signing in.",
    ),
    (
        ("login", "sign in", "password"),
        "Sign in with your registered email address and password. Contact "
        "verification is required during registration, not on every login.",
    ),
    (
        ("forgot password", "reset password", "password recovery"),
        "Choose Forgot Password on the sign-in form and enter your registered "
        "email. Follow the expiring link sent to that email to set a new password.",
    ),
    (
        ("country", "city", "state", "pin code", "postal code", "address"),
        "Hospital registration asks for the hospital name, administrator name, "
        "contact details, address, country, city, state, postal code, speciality, "
        "and registration number. Coordinates are not entered during signup.",
    ),
    (
        ("organ", "search", "availability"),
        "Sign in as Patient / Family and choose an organ in New request. The "
        "form shows verified hospitals reporting availability, and one request "
        "is shared with all matching hospitals. You do not select a hospital. "
        "OrganRoute does not determine medical eligibility or allocation.",
    ),
    (
        ("upload", "document", "documents", "pdf"),
        "In Patient / Family, open New request. You can preview and add a "
        "fictional sample PDF or upload a PDF, JPG, or PNG test file. Use "
        "fictional data only; never upload real patient records to OrganRoute.",
    ),
    (
        ("track", "tracking", "location"),
        "Sign in and open Requests in the patient dashboard to review each "
        "hospital response. For hospital delivery, the assigned driver and "
        "live location are shown after the driver starts the trip and grants "
        "location permission.",
    ),
    (
        ("delivery", "driver", "transport"),
        "After a hospital approves a request, the patient or family can choose "
        "Self Pickup or Hospital Delivery. The hospital assigns one of its own "
        "drivers for delivery; tracking begins only after the driver starts the "
        "trip and grants location permission.",
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


def faq_reply(message: str, history: Optional[List[ChatTurn]] = None) -> str:
    queries = [message]
    if history:
        queries.extend(
            turn.content
            for turn in reversed(history)
            if turn.role == "user"
        )

    for query in queries:
        lowered = query.casefold()
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
        return ChatResponse(
            reply=faq_reply(message, request.history),
            source="faq",
        )

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
                        "healthcare professionals. Clarify that demo data and "
                        "route estimates are not for clinical use."
                    ),
                },
                *[
                    {"role": turn.role, "content": turn.content}
                    for turn in request.history[-12:]
                ],
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
