import { z } from 'zod'
import { app } from 'electron'
import { databaseFile } from '../../db/client'
import { changePassword, login, logout, me } from '../../services/auth'
import { listAudit } from '../../services/audit'
import { dashboardSummary } from '../../services/dashboard'
import { getSettings, settingsPatch, updateSettings } from '../../services/settings'
import { completeSetup, setupStatus } from '../../services/setup'
import { listRoles, listUsers, saveUser, setPassword, setUserActive } from '../../services/users'
import { registerMany } from '../registry'

export const coreChannels = () =>
  registerMany([
    {
      channel: 'app.info',
      definition: {
        allowAnonymous: true,
        handler: () => ({
          name: app.getName(),
          version: app.getVersion(),
          databasePath: databaseFile() ?? '',
          initialized: setupStatus().initialized
        })
      }
    },
    { channel: 'setup.status', definition: { allowAnonymous: true, handler: () => setupStatus() } },
    {
      channel: 'setup.complete',
      definition: {
        allowAnonymous: true,
        schema: z.object({
          restaurantName: z.string().min(1).max(120),
          phone: z.string().max(40).nullish(),
          address: z.string().max(240).nullish(),
          currency: z.string().length(3),
          language: z.enum(['ar', 'fr']),
          taxEnabled: z.boolean(),
          taxRateBp: z.number().int().min(0).max(10000),
          ownerFullName: z.string().min(1).max(120),
          ownerUsername: z.string().min(3).max(48),
          ownerPassword: z.string().min(6).max(200)
        }),
        handler: (input: Parameters<typeof completeSetup>[0]) => completeSetup(input)
      }
    },
    {
      channel: 'auth.login',
      definition: {
        allowAnonymous: true,
        schema: z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) }),
        handler: (input: { username: string; password: string }) => login(input)
      }
    },
    { channel: 'auth.logout', definition: { allowAnonymous: true, handler: () => logout() } },
    { channel: 'auth.me', definition: { allowAnonymous: true, handler: () => me() } },
    {
      channel: 'auth.changePassword',
      definition: {
        schema: z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(6).max(200) }),
        handler: (input: { currentPassword: string; newPassword: string }) => changePassword(input)
      }
    },
    { channel: 'settings.get', definition: { handler: () => getSettings() } },
    {
      channel: 'settings.update',
      definition: {
        permission: 'settings.manage',
        schema: settingsPatch,
        handler: (input: Parameters<typeof updateSettings>[0]) => updateSettings(input)
      }
    },
    {
      channel: 'dashboard.summary',
      definition: {
        permission: 'dashboard.view',
        schema: z.object({ from: z.string().max(10).nullish(), to: z.string().max(10).nullish() }).default({}),
        handler: (input: { from?: string | null; to?: string | null }) => dashboardSummary(input)
      }
    },
    { channel: 'users.list', definition: { permission: 'employees.manage', handler: () => listUsers() } },
    { channel: 'users.roles', definition: { permission: 'employees.manage', handler: () => listRoles() } },
    {
      channel: 'users.save',
      definition: {
        permission: 'employees.manage',
        schema: z.object({
          id: z.number().int().positive().optional(),
          username: z.string().min(3).max(48),
          fullName: z.string().min(1).max(120),
          roleId: z.string().min(1).max(32),
          phone: z.string().max(40).nullish(),
          password: z.string().min(6).max(200).optional()
        }),
        handler: (input: Parameters<typeof saveUser>[0]) => saveUser(input)
      }
    },
    {
      channel: 'users.setActive',
      definition: {
        permission: 'employees.manage',
        schema: z.object({ id: z.number().int().positive(), active: z.boolean() }),
        handler: (input: { id: number; active: boolean }) => setUserActive(input.id, input.active)
      }
    },
    {
      channel: 'users.resetPassword',
      definition: {
        permission: 'employees.manage',
        schema: z.object({ id: z.number().int().positive(), password: z.string().min(6).max(200) }),
        handler: (input: { id: number; password: string }) => setPassword(input.id, input.password)
      }
    },
    { channel: 'audit.list', definition: { permission: 'audit.view', handler: () => listAudit() } }
  ])
