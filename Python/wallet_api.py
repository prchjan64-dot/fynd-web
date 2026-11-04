
from flask import Flask, request, jsonify

app = Flask(__name__)


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "success": True,
        "message": "FYND Wallet Python API is running."
    })


@app.route("/wallet-test", methods=["POST"])
def wallet_test():
    data = request.get_json(silent=True) or {}
    action = data.get("action", "")

    allowed_actions = ["add_credit", "transfer", "payment"]

    if action not in allowed_actions:
        return jsonify({
            "success": False,
            "message": "Invalid wallet action."
        }), 400

    return jsonify({
        "success": True,
        "message": "Wallet action received.",
        "action": action
    })


@app.route("/validate-transfer", methods=["POST"])
def validate_transfer():
    data = request.get_json(silent=True) or {}

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "message": "Invalid transfer amount."
        }), 400

    if not 1 <= amount <= 50000:
        return jsonify({
            "success": False,
            "message": "Amount must be between 1 and 50000."
        }), 400

    return jsonify({
        "success": True,
        "message": "Transfer amount validated.",
        "amount": round(amount, 2)
    })


@app.route("/check-routes", methods=["GET"])
def check_routes():
    return jsonify({
        "success": True,
        "routes": [
            str(rule) for rule in app.url_map.iter_rules()
        ]
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5002, debug=False)
