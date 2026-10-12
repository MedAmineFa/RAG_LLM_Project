
import os
import requests
from dotenv import load_dotenv

load_dotenv()

MODEL = "openai/gpt-oss-120b"
API_URL = "https://api.groq.com/openai/v1/chat/completions"
API_KEY = os.getenv("API_KEY")
REQUEST_TIMEOUT = 30


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }


def generate_answer(question: str, retrieved_docs: list) -> tuple[str, str]:

    context = "\n\n".join(doc["content"] for doc in retrieved_docs)

    system_prompt = f"""You are a helpful documentation assistant.

BEHAVIOR RULES:
- If the user's message is ONLY a greeting, farewell, or expression of thanks (for example: hi, hello, thanks, thank you, bye, goodbye), respond with exactly ONE short sentence.
- Otherwise, if the user is asking for information, answer normally and clearly.

STRICT RULES:
- Always respond in the same language as the user's question.
- Answer ONLY using the provided documentation below. NEVER use your own knowledge.
- If the answer is not found in the provided documents, politely inform the user that you don't have this information and suggest they contact support. Do not add anything else.
- Do not invent information.
- Present information naturally and confidently, never mention "the documentation", "the context", or "based on the provided text".

DOCUMENTATION:
{context}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question},
    ]

    response = requests.post(
        API_URL,
        headers=_headers(),
        json={"model": MODEL, "messages": messages, "temperature": 0.2, "max_tokens": 1024},
        timeout=REQUEST_TIMEOUT,
    )

    if response.status_code != 200:
        raise Exception(f"Groq API error {response.status_code}: {response.text}")

    return response.json()["choices"][0]["message"]["content"], MODEL
