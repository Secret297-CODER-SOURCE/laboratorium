export function getAttribution() {
  let referralCode = '';
  let campaignCode = '';
  try {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref && /^[a-z0-9]{6,32}$/i.test(ref)) {
      localStorage.setItem('lab_referral_code', ref.toUpperCase());
    }
    referralCode = localStorage.getItem('lab_referral_code') || '';
    campaignCode = params.get('campaign_code') || params.get('analytics_campaign_code') || '';
  } catch { /* Storage may be unavailable; attribution is optional. */ }
  return {
    referral_code: /^[a-z0-9]{6,32}$/i.test(referralCode) ? referralCode : '',
    campaign_code: /^[a-z0-9]{6,32}$/i.test(campaignCode) ? campaignCode : '',
  };
}
