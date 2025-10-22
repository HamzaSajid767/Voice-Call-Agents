import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { env } from '../config/env.js';
import { InternalServerError } from '../lib/errors.js';

export class LiveKitService {
  private readonly roomClient: RoomServiceClient | null;

  public constructor() {
    if (!env.LIVEKIT_URL) {
      this.roomClient = null;
      return;
    }
    this.roomClient = new RoomServiceClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  }

  public async createRoom(roomName: string): Promise<void> {
    if (!this.roomClient) {
      // Room creation is optional in dev if LIVEKIT_URL is not configured.
      return;
    }
    await this.roomClient.createRoom({ name: roomName, emptyTimeout: 60, maxParticipants: 10 });
  }

  public async deleteRoom(roomName: string): Promise<void> {
    if (!this.roomClient) {
      return;
    }
    await this.roomClient.deleteRoom(roomName);
  }

  public generateToken(params: {
    identity: string;
    roomName: string;
    participantName?: string;
    metadata?: Record<string, string>;
  }): string {
    try {
      const opts: { identity: string; name?: string; metadata?: string } = { identity: params.identity };
      if (params.participantName) {
        opts.name = params.participantName;
      }
      if (params.metadata) {
        opts.metadata = JSON.stringify(params.metadata);
      }
      const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, opts);
      at.addGrant({ room: params.roomName, roomJoin: true, canPublish: true, canSubscribe: true });
      // SDK returns string; some typings expose Promise<string> depending on version.
      return at.toJwt() as unknown as string;
    } catch (e) {
      throw new InternalServerError('Failed to generate LiveKit token', e);
    }
  }
}

