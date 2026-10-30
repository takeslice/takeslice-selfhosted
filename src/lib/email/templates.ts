import { layout } from "./index";

const codeStyle =
  "display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;letter-spacing:6px;font-weight:600;background:#f6f7f9;border-radius:8px;padding:12px 18px";

export function verifyEmail(to: string, code: string, appUrl: string) {
  return {
    to,
    subject: "Your confirmation code",
    html: layout(
      "Confirm your email address",
      `<p>Enter this code to finish creating your account:</p>
       <p><span style="${codeStyle}">${code}</span></p>
       <p style="font-size:13px;color:#6b7280">The code expires in 10 minutes. If you did not create an account, ignore this email.</p>`,
      appUrl,
    ),
    text: `Your confirmation code: ${code}\nIt expires in 10 minutes.`,
  };
}

export function resetPassword(to: string, code: string, appUrl: string) {
  return {
    to,
    subject: "Your password reset code",
    html: layout(
      "Reset your password",
      `<p>Enter this code to choose a new password:</p>
       <p><span style="${codeStyle}">${code}</span></p>
       <p style="font-size:13px;color:#6b7280">The code expires in 10 minutes. If you did not request it, ignore this email.</p>`,
      appUrl,
    ),
    text: `Your password reset code: ${code}\nIt expires in 10 minutes.`,
  };
}

export function applicationReceived(to: string, programName: string, appUrl: string) {
  return {
    to,
    subject: `We received your application to ${programName}`,
    html: layout(
      "Application received",
      `<p>Thanks for applying to <strong>${programName}</strong>. We review applications by hand and will email you when there is a decision.</p>
       <p>You can check the status any time in your partner dashboard.</p>
       <p><a href="${appUrl}/partners/dashboard">Open partner dashboard</a></p>`,
      appUrl,
    ),
    text: `We received your application to ${programName}. Check the status at ${appUrl}/partners/dashboard`,
  };
}

export function applicationApproved(to: string, programName: string, appUrl: string) {
  return {
    to,
    subject: `You are approved for ${programName}`,
    html: layout(
      "You are approved",
      `<p>Your application to <strong>${programName}</strong> was approved. Your referral link and dashboard are ready.</p>
       <p><a href="${appUrl}/partners/dashboard">Open partner dashboard</a></p>`,
      appUrl,
    ),
    text: `You are approved for ${programName}. Open your dashboard: ${appUrl}/partners/dashboard`,
  };
}

export function applicationRejected(to: string, programName: string, reason: string, appUrl: string) {
  return {
    to,
    subject: `Update on your application to ${programName}`,
    html: layout(
      "Application update",
      `<p>We could not approve your application to <strong>${programName}</strong>.</p>
       <p style="background:#f6f7f9;padding:12px;border-radius:8px">${reason}</p>
       <p>You can reply to this email if you think this was a mistake.</p>`,
      appUrl,
    ),
    text: `We could not approve your application to ${programName}. Reason: ${reason}`,
  };
}

export function newApplicationForAdmin(to: string, applicantName: string, appUrl: string) {
  return {
    to,
    subject: `New affiliate application from ${applicantName}`,
    html: layout(
      "New affiliate application",
      `<p><strong>${applicantName}</strong> applied to your partner program.</p>
       <p><a href="${appUrl}/dashboard/applications">Review the application</a></p>`,
      appUrl,
    ),
    text: `${applicantName} applied. Review: ${appUrl}/dashboard/applications`,
  };
}
