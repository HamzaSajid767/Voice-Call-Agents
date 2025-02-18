import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import ejs from 'ejs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.join(__dirname, '..', 'views', 'email');

const renderTemplate = (filename, data) =>
  new Promise((resolve, reject) => {
    ejs.renderFile(path.join(templatesDir, filename), data, (err, str) => {
      if (err) reject(err);
      else resolve(str);
    });
  });

const createTransporter = () => {
  if (
    !process.env.EMAIL_HOST ||
    !process.env.EMAIL_PORT ||
    !process.env.EMAIL_USER ||
    !process.env.EMAIL_PASS
  ) {
    throw new Error('Email environment variables are not fully defined');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
};

const sendInterestNotification = async (interestForm) => {
  const transporter = createTransporter();
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    throw new Error('ADMIN_EMAIL is not defined');
  }

  const tourId = interestForm.tour?.toString?.() ?? interestForm.tour;
  const html = await renderTemplate('interest-notification.ejs', {
    tourId,
    name: interestForm.name,
    surname: interestForm.surname,
    email: interestForm.email,
    phone: interestForm.phone,
    numberOfPersons: interestForm.numberOfPersons,
    comments: interestForm.comments,
  });

  const mailOptions = {
    from: `"AktiveCycle" <${process.env.EMAIL_USER}>`,
    to: adminEmail,
    subject: 'New tour interest submitted',
    text: `A new interest form has been submitted for tour ${tourId} by ${interestForm.name} ${interestForm.surname}.`,
    html,
  };

  await transporter.sendMail(mailOptions);
};

const OTP_EXPIRY_MINUTES = 10;

const sendPasswordResetOtpEmail = async (toEmail, otp) => {
  const transporter = createTransporter();
  const html = await renderTemplate('password-reset-otp.ejs', {
    otp,
    expiryMinutes: OTP_EXPIRY_MINUTES,
  });

  const mailOptions = {
    from: `"AktiveCycle" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Password reset – your OTP',
    text: `Your password reset OTP is: ${otp}. It is valid for ${OTP_EXPIRY_MINUTES} minutes. If you did not request this, ignore this email.`,
    html,
  };
  await transporter.sendMail(mailOptions);
};

function emailConfigured() {
  return Boolean(
    process.env.EMAIL_HOST &&
      process.env.EMAIL_PORT &&
      process.env.EMAIL_USER &&
      process.env.EMAIL_PASS,
  );
}

/**
 * Best-effort mail for lifecycle notifications (never throws).
 * @returns {Promise<boolean>}
 */
export async function sendRawEmailOptional({ to, subject, text, html }) {
  const addr = String(to || '')
    .trim()
    .toLowerCase();
  if (!addr || !emailConfigured()) {
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: `"Leads Getter" <${process.env.EMAIL_USER}>`,
      to: addr,
      subject: String(subject || '').slice(0, 200),
      text: text || undefined,
      html: html || undefined,
    });
    return true;
  } catch (e) {
    console.error('[email optional]', e.message);
    return false;
  }
}

export { sendInterestNotification, sendPasswordResetOtpEmail, OTP_EXPIRY_MINUTES };
