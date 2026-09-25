import functools
from typing import Any
from transformers import AutoTokenizer, T5ForConditionalGeneration

@functools.lru_cache(maxsize=1)
def get_t5_model_and_tokenizer() -> tuple:
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained("google/flan-t5-base")
    model = T5ForConditionalGeneration.from_pretrained("google/flan-t5-base").to(device)
    return tokenizer, model

def get_tokenizer() -> Any:
    return get_t5_model_and_tokenizer()[0]

def t5_translate(text: str, translator_tuple: tuple = None) -> str:
    if translator_tuple is None:
        tokenizer, model = get_t5_model_and_tokenizer()
    else:
        tokenizer, model = translator_tuple
        
    prompt = (
        "Translate English to Indian Sign Language (Gloss). "
        "Keep it simple and only output the gloss words separated by spaces.\n"
        "English: Hello.\nGloss: HELLO\n"
        "English: Good morning.\nGloss: GOOD HELLO\n"
        "English: Where is the doctor?\nGloss: WHERE DOCTOR\n"
        "English: I am hungry.\nGloss: I_ME HUNGRY\n"
        "English: What is your name?\nGloss: WHAT NAME YOU\n"
        "English: I need help.\nGloss: I_ME HELP\n"
        "English: Thank you very much.\nGloss: THANK_YOU\n"
        f"English: {text}\nGloss:"
    )
    
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512).to(model.device)
    outputs = model.generate(
        **inputs,
        max_new_tokens=64,
        temperature=0.1,
        do_sample=False
    )
    return tokenizer.decode(outputs[0], skip_special_tokens=True)

def recursive_token_splitter(text: str, max_tokens: int = 400, overlap: int = 50) -> list[str]:
    """
    Recursively splits text into chunks of at most max_tokens, 
    with a given overlap (in tokens) between chunks.
    """
    if not text:
        return []
    separators = ["\n\n", "\n", ".", ",", " "]
    return _split_with_overlap(text, max_tokens, overlap, separators)

def _split_with_overlap(text: str, max_tokens: int, overlap: int, separators: list[str]) -> list[str]:
    tokenizer = get_tokenizer()
    tokens = tokenizer.encode(text, add_special_tokens=False)
    if len(tokens) <= max_tokens:
        return [text.strip()] if text.strip() else []

    sep = ""
    for s in separators:
        if s in text:
            sep = s
            break

    # If no separator found, do a hard token split
    if not sep:
        chunks = []
        i = 0
        while i < len(tokens):
            chunk = tokenizer.decode(tokens[i : i + max_tokens])
            if chunk.strip():
                chunks.append(chunk.strip())
            i += max_tokens - overlap
        return chunks

    raw_splits = text.split(sep)
    # Re-attach the separator except for the last segment
    splits = [s + sep for s in raw_splits[:-1]] + [raw_splits[-1]]
    splits = [s for s in splits if s]

    chunks = []
    current_chunk = []
    current_length = 0

    for split in splits:
        split_tokens = tokenizer.encode(split, add_special_tokens=False)
        split_len = len(split_tokens)

        # If a single split is larger than max_tokens, recurse
        if split_len > max_tokens:
            if current_chunk:
                chunks.append("".join(current_chunk).strip())
                current_chunk = []
                current_length = 0
            
            next_separators = separators[separators.index(sep) + 1:] if sep in separators else []
            sub_chunks = _split_with_overlap(split, max_tokens, overlap, next_separators)
            chunks.extend(sub_chunks)
            continue

        # Check if adding this split exceeds max_tokens
        if current_length + split_len > max_tokens:
            chunks.append("".join(current_chunk).strip())
            
            # Keep 'overlap' tokens from the end of the previous chunk context
            while current_length > overlap and len(current_chunk) > 0:
                removed_text = current_chunk.pop(0)
                removed_len = len(tokenizer.encode(removed_text, add_special_tokens=False))
                current_length -= removed_len
            
            current_chunk.append(split)
            current_length += split_len
        else:
            current_chunk.append(split)
            current_length += split_len

    if current_chunk:
        chunks.append("".join(current_chunk).strip())

    return chunks
