import type { Request, Response } from 'express';
import type { AdminService } from './admin.service.js';
import type { AnalyticsService } from './analytics.service.js';
import type { MonitoringService } from './monitoring.service.js';
import type { BillingAnalyticsService } from './billing-analytics.service.js';

export class AdminController {
  public constructor(
    private readonly admin: AdminService,
    private readonly analytics: AnalyticsService,
    private readonly monitoring: MonitoringService,
    private readonly billing: BillingAnalyticsService
  ) {}

  public listTenants = async (req: Request, res: Response): Promise<void> => {
    const q = ((req as any).validated?.query ?? req.query) as unknown as { page: number; pageSize: number };
    const out = await this.admin.listTenants({ page: q.page, pageSize: q.pageSize });
    res.status(200).json({ data: out });
  };

  public createTenant = async (req: Request, res: Response): Promise<void> => {
    const body = ((req as any).validated?.body ?? req.body) as unknown as { name: string; email: string; plan: string; region: string };
    const out = await this.admin.createTenantOnboarding(body);
    res.status(201).json({ data: out });
  };

  public getTenant = async (req: Request, res: Response): Promise<void> => {
    const out = await this.admin.getTenantDetails(String(req.params['id']));
    res.status(200).json({ data: out });
  };

  public patchTenant = async (req: Request, res: Response): Promise<void> => {
    const out = await this.admin.patchTenant(String(req.params['id']), req.body);
    res.status(200).json({ data: out });
  };

  public listUsers = async (req: Request, res: Response): Promise<void> => {
    const q = ((req as any).validated?.query ?? req.query) as unknown as { page: number; pageSize: number; tenantId?: string };
    const out = await this.admin.listUsers({ page: q.page, pageSize: q.pageSize, ...(q.tenantId ? { tenantId: q.tenantId } : {}) });
    res.status(200).json({ data: out });
  };

  public patchUser = async (req: Request, res: Response): Promise<void> => {
    const out = await this.admin.patchUser(String(req.params['id']), req.body);
    res.status(200).json({ data: out });
  };

  public listCalls = async (req: Request, res: Response): Promise<void> => {
    const q = ((req as any).validated?.query ?? req.query) as unknown as {
      page: number;
      pageSize: number;
      tenantId?: string;
      status?: string;
      from?: string;
      to?: string;
    };
    const out = await this.admin.listCalls({
      page: q.page,
      pageSize: q.pageSize,
      ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from ? { from: new Date(q.from) } : {}),
      ...(q.to ? { to: new Date(q.to) } : {})
    });
    res.status(200).json({ data: out });
  };

  public getCall = async (req: Request, res: Response): Promise<void> => {
    const out = await this.admin.getCallDetails(String(req.params['id']));
    res.status(200).json({ data: out });
  };

  public listAgents = async (req: Request, res: Response): Promise<void> => {
    const q = ((req as any).validated?.query ?? req.query) as unknown as { page: number; pageSize: number; tenantId?: string };
    const out = await this.admin.listAgents({ page: q.page, pageSize: q.pageSize, ...(q.tenantId ? { tenantId: q.tenantId } : {}) });
    res.status(200).json({ data: out });
  };

  public getAgent = async (req: Request, res: Response): Promise<void> => {
    const out = await this.admin.getAgentDetails(String(req.params['id']));
    res.status(200).json({ data: out });
  };

  public patchAgent = async (req: Request, res: Response): Promise<void> => {
    const out = await this.admin.patchAgent(String(req.params['id']), req.body);
    res.status(200).json({ data: out });
  };

  public analyticsOverview = async (_req: Request, res: Response): Promise<void> => {
    const out = await this.analytics.overview();
    res.status(200).json({ data: out });
  };

  public analyticsTenant = async (req: Request, res: Response): Promise<void> => {
    const out = await this.analytics.tenantStats(String(req.params['tenantId']));
    res.status(200).json({ data: out });
  };

  public analyticsTrends = async (req: Request, res: Response): Promise<void> => {
    const q = ((req as any).validated?.query ?? req.query) as unknown as { tenantId?: string; from: string; to: string; interval: 'day' | 'hour' };
    const out = await this.analytics.trends({
      ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      from: new Date(q.from),
      to: new Date(q.to),
      interval: q.interval
    });
    res.status(200).json({ data: out });
  };

  public monitoringLive = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ data: this.monitoring.getLiveSnapshot() });
  };

  public billingBreakdown = async (req: Request, res: Response): Promise<void> => {
    const q = ((req as any).validated?.query ?? req.query) as unknown as { tenantId?: string; from?: string; to?: string };
    const out = await this.billing.breakdown({
      ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      ...(q.from && q.to ? { from: new Date(q.from), to: new Date(q.to) } : {})
    });
    res.status(200).json({ data: out });
  };

  public listPhoneNumbers = async (_req: Request, res: Response): Promise<void> => {
    const out = await this.admin.listPhoneNumbers();
    res.status(200).json({ data: out });
  };

  public purchasePhoneNumber = async (req: Request, res: Response): Promise<void> => {
    const body = ((req as any).validated?.body ?? req.body) as unknown as {
      e164?: string;
      country?: string;
      areaCode?: number;
      provider: 'TWILIO' | 'SIP';
    };
    const out = await this.admin.purchasePhoneNumber(body);
    res.status(201).json({ data: out });
  };

  public assignPhoneNumber = async (req: Request, res: Response): Promise<void> => {
    const body = ((req as any).validated?.body ?? req.body) as unknown as { phoneNumberId: string; tenantId: string };
    const out = await this.admin.assignPhoneNumber(body);
    res.status(200).json({ data: out });
  };
}

