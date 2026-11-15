import * as crmService from '../services/crm.service.js';

export async function getBoard(_req, res) {
  res.json(crmService.getBoard());
}

export async function listCompanies(req, res) {
  res.json({ companies: crmService.listCompanies({ q: req.query.q }) });
}

export async function createCompany(req, res) {
  res.status(201).json({ company: crmService.createCompany(req.body) });
}

export async function updateCompany(req, res) {
  res.json({ company: crmService.updateCompany(parseInt(req.params.id, 10), req.body) });
}

export async function listContacts(req, res) {
  res.json({
    contacts: crmService.listContacts({
      q: req.query.q,
      companyId: req.query.companyId ? parseInt(req.query.companyId, 10) : null,
    }),
  });
}

export async function createContact(req, res) {
  res.status(201).json({ contact: crmService.createContact(req.body) });
}

export async function updateContact(req, res) {
  res.json({ contact: crmService.updateContact(parseInt(req.params.id, 10), req.body) });
}

export async function createOpportunity(req, res) {
  res.status(201).json({
    opportunity: crmService.createOpportunity(req.body, req.user.id),
  });
}

export async function updateOpportunity(req, res) {
  res.json({
    opportunity: crmService.updateOpportunity(parseInt(req.params.id, 10), req.body),
  });
}

export async function getOpportunity(req, res) {
  res.json(crmService.getOpportunityDetail(parseInt(req.params.id, 10)));
}

export async function listActivities(req, res) {
  res.json({
    activities: crmService.listActivities({
      opportunityId: req.query.opportunityId ? parseInt(req.query.opportunityId, 10) : null,
      companyId: req.query.companyId ? parseInt(req.query.companyId, 10) : null,
      limit: req.query.limit,
    }),
  });
}

export async function addActivity(req, res) {
  res.status(201).json({
    activity: crmService.addActivity(req.body, req.user.id),
  });
}
