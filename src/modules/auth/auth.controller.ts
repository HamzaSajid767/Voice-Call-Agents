import type { Request, Response } from 'express';
import type { AuthService } from './auth.service.js';

export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  public register = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.register({
      email: req.body.email,
      password: req.body.password
    });
    res.status(201).json({
      data: {
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        tenant: result.tenant,
        user: result.user
      }
    });
  };

  public login = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.login({
      email: req.body.email,
      password: req.body.password
    });
    res.status(200).json({
      data: {
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        user: result.user
      }
    });
  };

  public forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.forgotPassword({
      tenantSlug: req.body.tenantSlug,
      email: req.body.email
    });
    res.status(200).json({ data: result });
  };

  public resetPassword = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.resetPassword({
      token: req.body.token,
      password: req.body.password
    });
    res.status(200).json({ data: result });
  };

  public me = async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId;
    const userType = req.auth?.userType;
    if (!userId || req.auth?.type !== 'jwt' || !userType) {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const result =
      req.auth?.tenantId !== undefined
        ? await this.authService.me({ userId, tenantId: req.auth.tenantId, userType })
        : await this.authService.me({ userId, userType });
    res.status(200).json({ data: result });
  };
}
