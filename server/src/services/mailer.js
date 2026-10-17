const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[mailer] SMTP not configured — emails will be printed to this terminal only.');
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = port === 465; // true for 465, false for 587

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Fail fast instead of hanging the HTTP request
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    // Helpful if your network intercepts TLS (common on some ISPs)
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

function fromAddress() {
  return process.env.MAIL_FROM || process.env.SMTP_USER;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log('================== DEV EMAIL ==================');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    console.log('==============================================');
    return { queued: false, dev: true };
  }
  const info = await t.sendMail({ from: fromAddress(), to, subject, html });
  console.log('[mailer] response:', {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  });
  return info;
}

async function sendVerificationCode(to, code, purpose) {
  // DEV SAFETY NET — always print code to terminal so testing never blocks
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev-mail] ${purpose} code for ${to}: ${code}`);
  }
  const title = purpose === 'signup' ? 'Verify your account' : 'Reset your password';
  const intro =
    purpose === 'signup'
      ? 'Thanks for registering. Use the code below to finish setting up your company account.'
      : 'You requested a password reset. Use the code below to set a new password.';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0B2A4A;">
      <h2 style="margin:0 0 12px;">${title}</h2>
      <p style="color:#5A6B7B;margin:0 0 20px;">${intro}</p>
      <div style="background:#F4F7FA;border:1px solid #E2E8EF;border-radius:8px;padding:20px;text-align:center;">
        <div style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#0B2A4A;">${code}</div>
      </div>
      <p style="color:#5A6B7B;font-size:13px;margin:20px 0 0;">This code expires in 10 minutes. If you did not request it, ignore this email.</p>
    </div>`;
  return sendMail({ to, subject: `${title} — Loan Default System`, html });
}

async function sendInvitationEmail(to, fullName, companyName, defaultPassword) {
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0B2A4A;">
      <h2 style="margin:0 0 12px;">Welcome to ${companyName}</h2>
      <p style="color:#5A6B7B;margin:0 0 16px;">Hi ${fullName}, your account has been created on the Loan Default Prediction System.</p>
      <div style="background:#F4F7FA;border:1px solid #E2E8EF;border-radius:8px;padding:16px;">
        <p style="margin:0 0 6px;"><strong>Email:</strong> ${to}</p>
        <p style="margin:0;"><strong>Temporary password:</strong> ${defaultPassword}</p>
      </div>
      <p style="color:#5A6B7B;font-size:13px;margin:16px 0 0;">You will be asked to change your password on first login.</p>
    </div>`;
  return sendMail({ to, subject: `Your account is ready — ${companyName}`, html });
}

module.exports = { sendMail, sendVerificationCode, sendInvitationEmail };