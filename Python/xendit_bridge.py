
import os
import uuid

import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

XENDIT_API_URL = "https://api.xendit.co/v2/invoices/"
MAX_AMOUNT = 50000


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "success": True,
        "message": "FYND Xendit Test Bridge is running."
    })


@app.route("/create-xendit-invoice", methods=["POST"])
def create_xendit_invoice():
    api_key = os.getenv("XENDIT_SECRET_KEY")


    if not api_key:
        return jsonify({
            "success": False,
            "message": "Xendit API key is not configured."
        }), 500

    data = request.get_json(silent=True) or {}

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "message": "Invalid amount."
        }), 400

    if not 1 <= amount <= MAX_AMOUNT:
        return jsonify({
            "success": False,
            "message": "Amount must be between 1 and 50000."
        }), 400

    reference = "FYND-" + uuid.uuid4().hex

    payload = {
        "external_id": reference,
        "amount": round(amount, 2),
        "currency": "PHP",
        "description": "FYND Wallet Top-up",
        "invoice_duration": 900,
       "success_redirect_url": "http://localhost/FYND/Fynd2.html",
       "failure_redirect_url": "http://localhost/FYND/Fynd2.html"
    }

    try:
        response = requests.post(
            XENDIT_API_URL,
            json=payload,
            auth=(api_key, ""),
            timeout=20
        )
    except requests.RequestException as exc:
        app.logger.warning(
            "Xendit connection failed: %s",
            type(exc).__name__
        )
        return jsonify({
            "success": False,
            "message": "Could not connect to Xendit."
        }), 502

    if not response.ok:
        try:
            error_data = response.json()
            error_code = error_data.get("error_code", "UNKNOWN")
            error_message = error_data.get(
                "message",
                "Xendit rejected the invoice request."
            )
        except ValueError:
            error_code = "UNKNOWN"
            error_message = "Xendit returned an unreadable error response."

        app.logger.warning(
            "Xendit invoice failed: HTTP %s; code=%s; message=%s",
            response.status_code,
            str(error_code)[:100],
            str(error_message)[:300]
        )

        return jsonify({
            "success": False,
            "message": "Xendit could not create the invoice.",
            "status_code": response.status_code,
            "error_code": error_code
        }), 502

    try:
        result = response.json()
    except ValueError:
        return jsonify({
            "success": False,
            "message": "Xendit returned an invalid response."
        }), 502

    checkout_url = result.get("invoice_url")

    if not isinstance(checkout_url, str):
        return jsonify({
            "success": False,
            "message": "Xendit did not return a checkout URL."
        }), 502

    if not checkout_url.startswith("https://"):
        return jsonify({
            "success": False,
            "message": "Invalid checkout URL."
        }), 502

    return jsonify({
        "success": True,
        "checkout_url": checkout_url,
        "reference_number": reference,
        "invoice_id": result.get("id")
    })


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5003,
        debug=False
    )
