import type { Request, Response } from 'express';
import type { UserService } from './user.service.js';

export class UserController {
  public constructor(private readonly userService: UserService) {}

  public getMe = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    const userId = req.auth?.userId;
    if (!tenantId || !userId || req.auth?.type !== 'jwt') {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const user = await this.userService.getMe(tenantId, userId);
    res.status(200).json({ data: { user } });
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const q = req.query as unknown as {
      page: number;
      pageSize: number;
      status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
    };
    const result = await this.userService.listUsers({
      tenantId,
      page: q.page,
      pageSize: q.pageSize,
      ...(q.status ? { status: q.status } : {})
    });
    res.status(200).json({ data: result });
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const user = await this.userService.createUser({
      tenantId,
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.fullName
    });
    res.status(201).json({ data: { user } });
  };
}
