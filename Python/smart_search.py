from flask import Flask, request, jsonify
from flask_cors import CORS
from difflib import SequenceMatcher
import re
import unicodedata

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/smart-search": {
            "origins": [
                "http://localhost",
                "http://127.0.0.1"
            ]
        }
    },
    methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"]
)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response


def normalize(text):
    text = unicodedata.normalize("NFKD", str(text or ""))
    text = "".join(
        c for c in text if not unicodedata.combining(c)
    )
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()


def smart_match(query, products):
    query = normalize(query)

    if not query:
        return products

    results = []

    for product in products:
        searchable = " ".join([
            str(product.get("title", "")),
            str(product.get("category", "")),
            str(product.get("description", "")),
            str(product.get("size", "")),
            str(product.get("seller", "")),
            str(product.get("condition", ""))
        ])

        text = normalize(searchable)
        words = text.split()

        if query in text:
            score = 1.0
        else:
            score = max(
                [similarity(query, word) for word in words]
                + [similarity(query, text)]
            )

        if score >= 0.60:
            results.append((score, product))

    results.sort(key=lambda item: item[0], reverse=True)

    return [product for score, product in results]


@app.route("/smart-search", methods=["POST", "OPTIONS"])
def search():
    if request.method == "OPTIONS":
        return "", 204

    data = request.get_json(silent=True) or {}
    query = str(data.get("query", "")).strip()
    products = data.get("products", [])

    if len(query) > 100:
        return jsonify({
            "ok": False,
            "error": "Search query is too long."
        }), 400

    if not isinstance(products, list):
        return jsonify({
            "ok": False,
            "error": "Products must be a list."
        }), 400

    results = smart_match(query, products)

    return jsonify({
        "ok": True,
        "products": results
    })


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )