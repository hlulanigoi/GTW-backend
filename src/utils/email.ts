import nodemailer from "nodemailer";
import config from "../config";

const transport = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.mailtrap.io",
  port: Number(process.env.EMAIL_PORT || 587),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
  },
});

export async function sendMail(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  const from = process.env.EMAIL_FROM || "no-reply@example.com";
  return transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}
