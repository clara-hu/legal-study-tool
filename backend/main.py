import os
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader
from openai import OpenAI


# Load environment variables from .env if present
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    # Fail fast if the key is not configured; we never log the actual key
    raise RuntimeError("OPENAI_API_KEY is not set. Please configure it in .env or your environment.")

client = OpenAI()

app = FastAPI(title="Legal Study Tool Backend")

# Allow the static frontend on localhost:8000 to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateResponse(BaseModel):
    title: str
    content: str
    kind: str


def extract_pdf_text(file_bytes: bytes, max_chars: int = 12000) -> str:
    """Extract text from a PDF (first pages, truncated to max_chars)."""
    reader = PdfReader(BytesIO(file_bytes))
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        text_parts.append(page_text)
        if sum(len(p) for p in text_parts) >= max_chars:
            break
    full_text = "\n".join(text_parts)
    return full_text[:max_chars]


async def call_openai_generate(kind: str, pdf_text: str, filename: str) -> GenerateResponse:
    if not pdf_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from the PDF.")

    if kind == "brief":
        system_prompt = (
            "You are an expert law tutor. Given excerpts from a casebook or syllabus, "
            "produce a structured case brief that is suitable for law school study. "
            "Include headings like: Facts, Issue, Holding, Reasoning, and Notes. "
            "If the text contains multiple cases, focus on the most important one and say so explicitly."
        )
        user_prompt = f"Create a detailed case brief based on the following text from {filename}:\n\n{pdf_text}"
    elif kind == "outline":
        system_prompt = (
            "You are an expert at creating law school course outlines. Given textbook or outline text, "
            "produce a concise but structured outline with headings, subheadings, and bullet points. "
            "Focus on doctrinal structure and elements, not storytelling."
        )
        user_prompt = f"Create a course outline based on the following text from {filename}:\n\n{pdf_text}"
    else:
        raise HTTPException(status_code=400, detail="Invalid kind; must be 'brief' or 'outline'.")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
    )

    content = response.choices[0].message.content
    title = f"{filename} – {'Case Brief' if kind == 'brief' else 'Outline'}"

    return GenerateResponse(title=title, content=content, kind=kind)


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(
    kind: str = Form(..., pattern="^(brief|outline)$"),
    file: UploadFile = File(...),
):
    """Generate a case brief or outline from an uploaded PDF using OpenAI."""
    if file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    pdf_text = extract_pdf_text(file_bytes)
    return await call_openai_generate(kind=kind, pdf_text=pdf_text, filename=file.filename)
