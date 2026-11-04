import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// Memória local para testes e modo mock/desenvolvimento
const sentEmails = [];

/**
 * Envia e-mail de recuperação de senha com token temporário e link
 */
export async function sendPasswordResetEmail({ to, token, resetUrl }) {
  const subject = "Recuperação de Senha - FitTrack";
  const safeResetUrl =
    resetUrl ||
    `${process.env.APP_URL || "http://localhost:3000"}/recuperar-senha?token=${encodeURIComponent(token)}`;

  const text = `Olá,

Você solicitou a redefinição de senha da sua conta no FitTrack.
Utilize o token seguro abaixo para cadastrar sua nova senha:

Token: ${token}
Link direto: ${safeResetUrl}

Este token expira em 1 hora e só pode ser utilizado uma única vez.
Se você não solicitou esta redefinição, ignore este e-mail.

Atenciosamente,
Equipe FitTrack`;

  const html = `
    <div style="font-family: sans-serif; color: #222; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ff5722;">Recuperação de Senha - FitTrack</h2>
      <p>Você solicitou a redefinição de senha da sua conta.</p>
      <p>Seu código/token de acesso temporário é:</p>
      <div style="background: #f4f4f4; padding: 12px 20px; font-size: 18px; font-weight: bold; letter-spacing: 2px; border-radius: 6px; display: inline-block;">
        ${token}
      </div>
      <p style="margin-top: 20px;">Ou acesse o link de redefinição direta:</p>
      <p><a href="${safeResetUrl}" style="color: #ff5722; font-weight: bold;">Redefinir Minha Senha</a></p>
      <small style="color: #888;">Este token expira em 1 hora e é de uso único. Caso não tenha solicitado, ignore esta mensagem.</small>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
}

/**
 * Adaptador de envio de e-mail (Real SMTP vs Mock seguro)
 */
export async function sendEmail({ to, subject, text, html }) {
  const emailRecord = {
    id: crypto.randomUUID(),
    to,
    subject,
    text,
    html,
    sentAt: new Date().toISOString(),
  };

  if (
    process.env.EMAIL_SERVICE_URL &&
    process.env.EMAIL_API_KEY &&
    process.env.EMAIL_MODE !== "mock"
  ) {
    const response = await fetch(process.env.EMAIL_SERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Falha no provedor de e-mail.");
    return { success: true, mode: "provider" };
  }
  if (process.env.NODE_ENV === "production")
    throw Object.assign(new Error("Provedor de e-mail não configurado."), {
      status: 503,
    });
  // Modo Mock em Desenvolvimento e Testes (deterministico e inspecionável)
  sentEmails.push(emailRecord);
  return { success: true, mode: "mock", id: emailRecord.id };
}

export function getLastSentEmail() {
  return sentEmails[sentEmails.length - 1] || null;
}

export function getAllSentEmails() {
  return [...sentEmails];
}

export function clearSentEmails() {
  sentEmails.length = 0;
}

export default {
  sendPasswordResetEmail,
  sendEmail,
  getLastSentEmail,
  getAllSentEmails,
  clearSentEmails,
};
