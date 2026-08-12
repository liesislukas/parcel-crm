import type { Channel } from "@/lib/campaigns/model";

/**
 * The six mocked outreach templates — two families × three channels — carrying the
 * kit's metadata shape (`manage-channel-templates/SKILL.md:44-56`) and a renderer that
 * throws rather than silently emptying an unknown variable
 * (`manage-channel-templates/SKILL.md:30-42`).
 */

export type TemplateFamily = "acquisition_intro" | "acquisition_followup";

export type ChannelTemplate = {
  templateId: string; // `${family}.${channel}.v1`
  family: TemplateFamily;
  variant: "v1";
  channel: Channel;
  language: "en-US";
  active: true;
  variables: string[]; // exact variable names this body uses
  complianceText: string;
  subject: string | null; // email only; null for sms and direct_mail
  body: string; // contains {{variable}} tokens
};

export const SMS_MAX_CHARS = 320;
export const SIMULATION_FOOTER = "[SIMULATED — this message was never sent]";

const COMPLIANCE_TEXT: Record<Channel, string> = {
  email: "Unsubscribe by replying UNSUBSCRIBE.",
  sms: "Reply STOP to opt out.",
  direct_mail:
    "Elephant Land Acquisition · PO Box 000 · Rock Island IL 61201 (simulated return address)",
};

export const TEMPLATES: ChannelTemplate[] = [
  {
    templateId: "acquisition_intro.email.v1",
    family: "acquisition_intro",
    variant: "v1",
    channel: "email",
    language: "en-US",
    active: true,
    variables: ["owner_name", "parcel_count", "total_acres", "project_name", "short_url", "sender_name"],
    complianceText: COMPLIANCE_TEXT.email,
    subject: "Interest in your Rock Island County property ({{parcel_count}} parcels)",
    body: `{{owner_name}},

Elephant is evaluating land in Rock Island County, Illinois for a data-center site.
Your {{parcel_count}} parcel(s), totalling {{total_acres}}, sit inside the area we are
studying ({{project_name}}).

If you would consider a sale, you can review the outline and register interest here:
{{short_url}}

{{sender_name}}`,
  },
  {
    templateId: "acquisition_intro.sms.v1",
    family: "acquisition_intro",
    variant: "v1",
    channel: "sms",
    language: "en-US",
    active: true,
    variables: ["owner_name", "project_name", "parcel_count", "total_acres", "short_url"],
    complianceText: COMPLIANCE_TEXT.sms,
    subject: null,
    body: "{{owner_name}}: Elephant is studying {{project_name}} in Rock Island County and your {{parcel_count}} parcel(s) ({{total_acres}}) are inside it. Details: {{short_url}}",
  },
  {
    templateId: "acquisition_intro.direct_mail.v1",
    family: "acquisition_intro",
    variant: "v1",
    channel: "direct_mail",
    language: "en-US",
    active: true,
    variables: [
      "owner_name",
      "mailing_address",
      "parcel_count",
      "total_acres",
      "project_name",
      "short_url",
      "sender_name",
    ],
    complianceText: COMPLIANCE_TEXT.direct_mail,
    subject: null,
    body: `{{owner_name}}
{{mailing_address}}

Re: {{parcel_count}} parcel(s) in Rock Island County, Illinois — {{total_acres}}

We are assembling land for {{project_name}} and your property sits inside the study area.
If you would consider a sale, scan the printed code or visit {{short_url}} to review the
outline and register interest.

{{sender_name}}`,
  },
  {
    templateId: "acquisition_followup.email.v1",
    family: "acquisition_followup",
    variant: "v1",
    channel: "email",
    language: "en-US",
    active: true,
    variables: ["owner_name", "project_name", "parcel_count", "total_acres", "short_url", "sender_name"],
    complianceText: COMPLIANCE_TEXT.email,
    subject: "Following up on your Rock Island County property",
    body: `{{owner_name}},

Following up on our earlier note about {{project_name}}. Your {{parcel_count}} parcel(s)
({{total_acres}}) remain inside the area we are studying, and we would still like to talk.

{{short_url}}

{{sender_name}}`,
  },
  {
    templateId: "acquisition_followup.sms.v1",
    family: "acquisition_followup",
    variant: "v1",
    channel: "sms",
    language: "en-US",
    active: true,
    variables: ["owner_name", "project_name", "parcel_count", "total_acres", "short_url"],
    complianceText: COMPLIANCE_TEXT.sms,
    subject: null,
    body: "{{owner_name}}: following up from Elephant about {{project_name}} — your {{parcel_count}} parcel(s) ({{total_acres}}). {{short_url}}",
  },
  {
    templateId: "acquisition_followup.direct_mail.v1",
    family: "acquisition_followup",
    variant: "v1",
    channel: "direct_mail",
    language: "en-US",
    active: true,
    variables: [
      "owner_name",
      "mailing_address",
      "parcel_count",
      "total_acres",
      "project_name",
      "short_url",
      "sender_name",
    ],
    complianceText: COMPLIANCE_TEXT.direct_mail,
    subject: null,
    body: `{{owner_name}}
{{mailing_address}}

Re: follow-up — {{parcel_count}} parcel(s), {{total_acres}}

We wrote to you about {{project_name}} and have not heard back. If a sale is something you
would consider, visit {{short_url}} or return the enclosed card.

{{sender_name}}`,
  },
];

export function templateFor(family: TemplateFamily, channel: Channel): ChannelTemplate {
  const found = TEMPLATES.find((t) => t.family === family && t.channel === channel);
  if (!found) {
    throw new Error(`no template for ${family}.${channel}`);
  }
  return found;
}

/**
 * Replaces every `{{name}}` in the subject (when present, prepended as `Subject: …`) and
 * body with `vars[name]`. Throws on an unknown variable rather than substituting an
 * empty string — the kit's no-silent-fallback rule
 * (`manage-channel-templates/SKILL.md:30-42`).
 */
export function renderTemplate(template: ChannelTemplate, vars: Record<string, string>): string {
  const withSubject =
    template.subject !== null ? `Subject: ${template.subject}\n\n${template.body}` : template.body;

  const rendered = withSubject.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) {
      throw new Error(`unknown template variable: ${name}`);
    }
    return vars[name];
  });

  return `${rendered}\n\n${template.complianceText}\n${SIMULATION_FOOTER}`;
}
