# import smtplib
# from email.mime.text import MIMEText
# from email.mime.multipart import MIMEMultipart

# def send_email(to_email, subject, body):

#     from_email = "wwewinter661@gmail.com"
#     password = "hohg sbdr phld touc"  # use app password for Gmail

#     # Create the email
#     msg = MIMEMultipart()
#     msg['From'] = from_email
#     msg['To'] = to_email
#     msg['Subject'] = subject
#     msg.attach(MIMEText(body, 'plain'))

#     # Connect to Gmail SMTP server
#     server = smtplib.SMTP('smtp.gmail.com', 587)
#     server.starttls()
#     server.login(from_email, password)
#     server.send_message(msg)
#     server.quit()

#     print(f"Email sent to {to_email}")
#     # Plug in SMTP or SendGrid here
#     print(f"Sending email -> {to_email}: {subject} - {body}")

# from sendgrid import SendGridAPIClient
# from sendgrid.helpers.mail import Mail

# def send_email_sendgrid(to_email, subject, body):
#     message = Mail(
#         from_email='wwewinter661@gmail.com',
#         to_emails=to_email,
#         subject=subject,
#         plain_text_content=body
#     )
#     try:
#         sg = SendGridAPIClient('YOUR_SENDGRID_API_KEY')
#         response = sg.send(message)
#         print(f"Email sent to {to_email}, status code: {response.status_code}")
#     except Exception as e:
#         print(f"Error sending email: {e}")

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(to_email, subject, body_html, body_text="This email requires an HTML-compatible client."):
    print('mailing')
    from_email = "wwewinter661@gmail.com"
    password = "hohg sbdr phld touc"  # Gmail app password

    # Create the email
    msg = MIMEMultipart("alternative")
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = subject

    # Attach plain-text and HTML versions
    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    # Connect to Gmail SMTP server
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(from_email, password)
    server.send_message(msg)
    server.quit()

    print(f"Email sent to {to_email}")

# send_email("wildking4421@gmail.com", "Test Email", "Hello from ScholarSync!")
welcome_html = """
<html>
  <body style="font-family: Arial; background:#f4f4f4; padding:20px;">
    <div style="max-width:600px;margin:auto;background:white;padding:20px;border-radius:8px;">
      <h2 style="color:#254085;">🎉 Welcome to Our System!</h2>
      <p>Hi <b>John</b>,</p>
      <p>We’re excited to have you onboard 🚀</p>
      <a href="https://yoursite.com/login" 
         style="display:inline-block;background:#254085;color:white;padding:12px 20px;
                text-decoration:none;border-radius:5px;margin-top:20px;">
         Get Started
      </a>
      <p style="margin-top:30px;">Cheers,<br>The Team</p>
    </div>
  </body>
</html>
"""

send_email("wildking4421@gmail.com", "Welcome to Our System 🎉", welcome_html)
