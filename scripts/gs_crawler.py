from dotenv import load_dotenv
from serpapi import GoogleSearch
from datetime import datetime
import difflib
import json, re
from pathlib import Path
import os

CONFIG_PATH = Path("config.json")
PUBLICATIONS_PATH = Path("./data/publications.json")

with open(CONFIG_PATH, encoding="utf-8") as f:
    config = json.load(f)
AUTHOR_ID = config["personal"]["google_scholar"]

def normalize_title(t: str) -> str:
    """
    Normalize the given title string.

    This function converts the title to lowercase, removes extra spaces,
    and strips non-alphanumeric characters except spaces.

    Args:
        t (str): The title to normalize.

    Returns:
        str: The normalized title.
    """
    # Convert to lowercase
    t = t.lower()
    
    # Replace multiple spaces with a single space
    t = re.sub(r"\s+", " ", t)
    
    # Remove non-word characters except spaces
    t = re.sub(r"[^\w\s]", "", t)
    
    # Trim leading and trailing spaces
    return t.strip()

def fetch_citation_map(author_id: str) -> dict:
    """
    Fetches a map of publication titles and their citation counts for a given author.

    This function searches for an author using their Google Scholar ID and retrieves
    the list of publications along with the number of citations for each. The titles
    are normalized for consistent key representation.

    Args:
        author_id (str): The Google Scholar ID of the author.

    Returns:
        dict: A dictionary mapping normalized publication titles to their citation counts.
    """
    load_dotenv()
    api_key = os.getenv("SERP_API_KEY")
    
    if not api_key:
        raise RuntimeError("No SERP_API_KEY found (Check .env)")

    params = {
    "api_key": api_key,
    "engine": "google_scholar_author",
    "hl": "en",
    "author_id": author_id,
    "num": "100"
    }
    
    # Search for the author by ID
    search = GoogleSearch(params)
    results = search.get_dict()

    if "error" in results:
        raise RuntimeError(f"SerpAPI error: {results['error']}")
    
    citation_map = {}
    next_token = None
    
    # Iterate through all publications of the author
    for article in results.get("articles", []):
        # Retrieve the title of the publication
        title: str = article.get("title")
        
        # Skip if title is not available
        if not title:
            continue
        
        # Retrieve the number of citations
        cited_by = article.get("cited_by") or {}
        citations = cited_by.get("value", 0) or 0
        
        # Normalize the title and add to the citation map
        citation_map[normalize_title(title)] = int(citations)
    
    return citation_map

def update_publications_file():
    """
    Reads the publications file, updates the citation counts for each publication,
    and writes the updated file.

    The function fetches the citation counts for all publications of the author
    using their Google Scholar ID. It reads the publications file, updates the
    citation count for each publication, and writes the updated file.
    """
    if not PUBLICATIONS_PATH.exists():
        raise FileNotFoundError(f"{PUBLICATIONS_PATH} not found")

    data = json.loads(PUBLICATIONS_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("publications.json format is not a list")

    citation_map = fetch_citation_map(AUTHOR_ID)
    norm_keys = list(citation_map.keys())
    now = datetime.now().isoformat(timespec="seconds")

    updated, skipped, fuzzy_used = 0, 0, 0

    for item in data:
        title = item.get("title", "")
        if not title:
            skipped += 1
            continue

        # Normalize the title and get the citation count
        key = normalize_title(title)
        citations_new = citation_map.get(key)

        # If exact matching fails, use fuzzy matching (conservatively)
        if citations_new is None:
            matches = difflib.get_close_matches(key, norm_keys, n=1, cutoff=0.92)
            if matches:
                citations_new = citation_map[matches[0]]
                fuzzy_used += 1

        # If exact matching fails, skip
        if citations_new is None:
            skipped += 1
            continue

        # Update the citation count if it has changed
        citations_old = int(item.get("citations", 0))
        if citations_new != citations_old:
            item["citations"] = citations_new
            item["citations_last_checked"] = now
            updated += 1
        else:
            # If the citation count is the same, record the check time
            item["citations_last_checked"] = now

    PUBLICATIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Updated: {updated} items, Skipped: {skipped} items, Fuzzy matched: {fuzzy_used} items, Total Scholar items: {len(citation_map)}")

if __name__ == "__main__":
    update_publications_file()