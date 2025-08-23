import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(to_email, subject, body):

    from_email = "wwewinter661@gmail.com"
    password = "hohg sbdr phld touc"  # use app password for Gmail

    # Create the email
    msg = MIMEMultipart()
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    # Connect to Gmail SMTP server
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(from_email, password)
    server.send_message(msg)
    server.quit()

    print(f"Email sent to {to_email}")
    # Plug in SMTP or SendGrid here
    print(f"Sending email -> {to_email}: {subject} - {body}")

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

def send_email_sendgrid(to_email, subject, body):
    message = Mail(
        from_email='wwewinter661@gmail.com',
        to_emails=to_email,
        subject=subject,
        plain_text_content=body
    )
    try:
        sg = SendGridAPIClient('YOUR_SENDGRID_API_KEY')
        response = sg.send(message)
        print(f"Email sent to {to_email}, status code: {response.status_code}")
    except Exception as e:
        print(f"Error sending email: {e}")

send_email("wildking4421@gmail.com", "Test Email", "Hello from ScholarSync!")
