import os
import requests
import logging

logger = logging.getLogger(__name__)

def send_email(to_email: str, subject: str, body: str):
    resend_api_key = os.getenv("RESEND_API_KEY")
    
    if not resend_api_key:
        logger.warning(f"RESEND_API_KEY not configured. Skipping email to {to_email}")
        return False

    headers = {
        "Authorization": f"Bearer {resend_api_key}",
        "Content-Type": "application/json"
    }

    resend_from = os.getenv("RESEND_FROM_EMAIL", "Wandr Travel <onboarding@resend.dev>")

    # Resend provides a free testing domain for sending emails
    payload = {
        "from": resend_from,
        "to": [to_email],
        "subject": subject,
        "html": body
    }

    try:
        # Use standard HTTP POST on port 443, easily bypassing Render's SMTP firewall
        response = requests.post("https://api.resend.com/emails", json=payload, headers=headers)
        
        if not response.ok:
            error_data = response.json()
            logger.error(f"Resend API Error: {error_data}")
            return False
            
        logger.info(f"Email sent successfully to {to_email} via Resend")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False
