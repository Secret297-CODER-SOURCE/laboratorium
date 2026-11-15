import config from '../config/index.js';
import * as gitOAuth from '../services/git-oauth.service.js';

export async function listAccounts(req, res) {
  res.json({
    accounts: gitOAuth.listAccounts(req.user.id),
    providers: gitOAuth.providersStatus(),
  });
}

export async function start(req, res) {
  const provider = String(req.params.provider || '').toLowerCase();
  const { url } = gitOAuth.startOAuth(provider, req.user.id);
  res.json({ url, provider });
}

export async function callback(req, res) {
  const provider = String(req.params.provider || '').toLowerCase();
  const appUrl = (config.appUrl || '').replace(/\/+$/, '') || '';
  try {
    await gitOAuth.completeOAuth(provider, req.query);
    res.redirect(`${appUrl}/dashboard.html#code?git=${encodeURIComponent(provider)}`);
  } catch {
    res.redirect(`${appUrl}/dashboard.html#code?git_error=1`);
  }
}

export async function unlink(req, res) {
  const provider = String(req.params.provider || '').toLowerCase();
  res.json(gitOAuth.unlink(req.user.id, provider));
}
