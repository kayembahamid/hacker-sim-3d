// The lesson continues outside the fictional office. These are training
// reminders, not organization-specific policy or instructions collected from
// the facilitator. Internal session details never enter the simulator.
export const workplaceActions = {
  'shared-document': 'Check the full sender address and the destination before opening a shared document. Open the service through a bookmark or a route you already trust, and report suspicious messages through your organization’s reporting channel.',
  'chatbot-data-leak': 'Use your organization’s approved AI tool and follow its data-handling policy. Check what information the tool is approved to receive before pasting work data. If you already shared sensitive information, report what was shared and where promptly.',
  'report-fast': 'Report the suspicious message promptly through your organization’s reporting channel, even if you already clicked. Tell the response team what happened and when. Keep the message available for them and follow their instructions.',
  'vendor-bank-change': 'Pause a payment or bank-detail change until you have independently verified it through a contact route you already trust, such as the supplier record. Follow your payment approval process and escalate any mismatch through your approved reporting channel.',
  'push-storm': 'Deny sign-in prompts you did not start and never give a caller an authentication code. Contact your service desk through a known route, report the unexpected prompts, and follow its account recovery instructions.',
  'account-recovery': 'Never share a recovery code with someone who contacts you. Use your organization’s approved identity verification and account recovery process. Ask the service desk to help review outdated recovery methods and report unexpected reset requests.',
  'sql-injection': 'Reproduce the issue only in an authorized test environment. Use parameterized queries and the access your application actually needs. Retest the attack and a normal sign-in, record the evidence, and send the fix through your team’s review process.',
  'stored-xss': 'Reproduce the stored script only in an authorized test environment. Apply output encoding for the rendering context and use your approved sanitizer where HTML is needed. Retest the payload and normal content, then record the result in the security issue.',
  'broken-access-control': 'Test access with separate authorized test accounts. Check ownership and permissions on the server for every request. Prove that another account’s data is blocked and that the owner’s normal workflow still works, then have the fix reviewed.'
};

export const workplaceFallback = 'Pause when a request feels unusual. Verify it through a contact route you already trust, follow your organization’s policy, and report concerns through its approved channel. Agree one action you will practise at work, who will follow up, and when.';
