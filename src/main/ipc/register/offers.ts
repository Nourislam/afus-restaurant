import { z } from 'zod'
import { getOffer, listOffers, offersFor, removeOffer, saveOffer, setOfferActive } from '../../services/offers'
import { applyOffer } from '../../services/orders'
import { adjust, balance, cancelRedeem, loyaltyRules, movements, redeem } from '../../services/loyalty'
import { registerMany } from '../registry'

const id = z.number().int().positive()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const clock = z.string().regex(/^\d{2}:\d{2}$/)

export const offersChannels = () =>
  registerMany([
    { channel: 'offers.list', definition: { permission: ['menu.view', 'pos.use'], schema: z.object({ includeInactive: z.boolean().optional() }).passthrough(), handler: (input: { includeInactive?: boolean }) => listOffers(input.includeInactive ?? true) } },
    { channel: 'offers.get', definition: { permission: 'menu.view', schema: z.object({ id }), handler: (input: { id: number }) => getOffer(input.id) } },
    {
      channel: 'offers.save',
      definition: {
        permission: 'menu.manage',
        schema: z.object({
          id: id.optional(),
          nameAr: z.string().min(1).max(120),
          nameFr: z.string().max(120).optional(),
          kind: z.enum(['percent', 'amount', 'combo', 'freeItem']),
          scope: z.enum(['order', 'category', 'product']).optional(),
          targetId: id.nullable().optional(),
          valueBp: z.number().int().min(0).max(10_000).optional(),
          valueCents: z.number().int().min(0).optional(),
          minSubtotalCents: z.number().int().min(0).optional(),
          comboPriceCents: z.number().int().min(0).optional(),
          freeQty: z.number().int().min(0).max(99).optional(),
          startsOn: day.nullable().optional(),
          endsOn: day.nullable().optional(),
          daysMask: z.number().int().min(0).max(127).optional(),
          startTime: clock.nullable().optional(),
          endTime: clock.nullable().optional(),
          usageLimit: z.number().int().min(0).max(1_000_000).optional(),
          isActive: z.boolean().optional(),
          items: z.array(z.object({ productId: id, qty: z.number().int().min(1).max(99).optional() })).max(20).optional()
        }),
        handler: (input: Parameters<typeof saveOffer>[0]) => saveOffer(input)
      }
    },
    { channel: 'offers.setActive', definition: { permission: 'menu.manage', schema: z.object({ id, active: z.boolean() }), handler: (input: { id: number; active: boolean }) => setOfferActive(input.id, input.active) } },
    { channel: 'offers.remove', definition: { permission: 'menu.manage', schema: z.object({ id }), handler: (input: { id: number }) => removeOffer(input.id) } },
    { channel: 'offers.forOrder', definition: { permission: 'pos.use', schema: z.object({ orderId: id }), handler: (input: { orderId: number }) => offersFor(input.orderId) } },
    {
      channel: 'orders.applyOffer',
      definition: {
        permission: ['pos.use', 'orders.discount'],
        schema: z.object({ orderId: id, offerId: id.nullable().optional(), auto: z.boolean().optional() }),
        handler: (input: Parameters<typeof applyOffer>[0]) => applyOffer(input)
      }
    },

    { channel: 'loyalty.rules', definition: { permission: ['pos.use', 'customers.manage'], handler: () => loyaltyRules() } },
    { channel: 'loyalty.balance', definition: { permission: ['pos.use', 'customers.manage'], schema: z.object({ customerId: id }), handler: (input: { customerId: number }) => ({ points: balance(input.customerId) }) } },
    { channel: 'loyalty.movements', definition: { permission: 'customers.manage', schema: z.object({ customerId: id, limit: z.number().int().min(1).max(500).optional() }), handler: (input: { customerId: number; limit?: number }) => movements(input.customerId, input.limit ?? 100) } },
    { channel: 'loyalty.redeem', definition: { permission: 'pos.use', schema: z.object({ orderId: id, points: z.number().int().positive() }), handler: (input: { orderId: number; points: number }) => redeem(input.orderId, input.points) } },
    { channel: 'loyalty.cancelRedeem', definition: { permission: 'pos.use', schema: z.object({ orderId: id }), handler: (input: { orderId: number }) => cancelRedeem(input.orderId) } },
    { channel: 'loyalty.adjust', definition: { permission: 'customers.manage', schema: z.object({ customerId: id, points: z.number().int(), note: z.string().max(200).nullable().optional() }), handler: (input: { customerId: number; points: number; note?: string | null }) => ({ points: adjust(input.customerId, input.points, input.note) }) } }
  ])
