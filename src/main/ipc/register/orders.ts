import { z } from 'zod'
import {
  addItem,
  buildOrder,
  cancelOrder,
  completeOrder,
  createOrder,
  getOrder,
  holdOrder,
  listOrders,
  mergeOrders,
  moveTable,
  payOrder,
  removeItem,
  resumeOrder,
  sendToKitchen,
  setDiscount,
  setNote,
  setStatus,
  updateItem
} from '../../services/orders'
import { kitchenBoard, setItemKitchenStatus } from '../../services/kitchen'
import { adjustLoyalty, getCustomer, listCustomers, saveCustomer, toggleFavorite } from '../../services/customers'
import { exportPdf, listPrinters, printHtml } from '../../services/print'
import { exportSite, getWebsiteState, setWebsiteConfig, startSite, stopSite, webOrders } from '../../services/website'
import { listBranches, listOverrides, saveBranch, setBranchActive, setBranchOpen, setOverride } from '../../services/branches'
import { receiptHtml } from '@shared/receipts'
import { getSettings } from '../../services/settings'
import { registerMany } from '../registry'

const hoursSchema = z
  .record(z.enum(['0', '1', '2', '3', '4', '5', '6']), z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/) }).nullable())
  .optional()

const itemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().min(1).max(999),
  variantId: z.number().int().positive().nullish(),
  modifierIds: z.array(z.number().int().positive()).optional(),
  note: z.string().max(240).nullish()
})

export const ordersChannels = () =>
  registerMany([
    {
      channel: 'orders.list',
      definition: {
        permission: 'orders.view',
        schema: z
          .object({
            status: z.string().max(24).nullish(),
            type: z.string().max(24).nullish(),
            from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
            to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
            search: z.string().max(80).nullish(),
            held: z.boolean().optional(),
            limit: z.number().int().positive().max(500).optional()
          })
          .default({}),
        handler: (input: Parameters<typeof listOrders>[0]) => listOrders(input)
      }
    },
    {
      channel: 'orders.get',
      definition: {
        permission: 'orders.view',
        schema: z.object({ id: z.number().int().positive() }),
        handler: (input: { id: number }) => getOrder(input.id)
      }
    },
    {
      channel: 'orders.create',
      definition: {
        permission: 'pos.use',
        schema: z.object({
          type: z.enum(['dineIn', 'delivery', 'takeaway', 'preorder']),
          tableId: z.number().int().positive().nullish(),
          customerId: z.number().int().positive().nullish(),
          covers: z.number().int().min(1).max(99).nullish(),
          note: z.string().max(240).nullish(),
          scheduledFor: z.string().max(20).nullish(),
          items: z.array(itemSchema).optional(),
          delivery: z
            .object({
              customerName: z.string().min(1).max(120),
              phone: z.string().min(1).max(40),
              address: z.string().min(1).max(240),
              area: z.string().max(80).nullish(),
              feeCents: z.number().int().min(0).optional(),
              courier: z.string().max(80).nullish()
            })
            .nullish()
        }),
        handler: (input: Parameters<typeof createOrder>[0]) => createOrder(input)
      }
    },
    {
      channel: 'orders.addItem',
      definition: {
        permission: 'pos.use',
        schema: itemSchema.extend({ orderId: z.number().int().positive() }),
        handler: (input: Parameters<typeof addItem>[0]) => addItem(input)
      }
    },
    {
      channel: 'orders.updateItem',
      definition: {
        permission: 'pos.use',
        schema: z.object({ itemId: z.number().int().positive(), qty: z.number().int().min(1).max(999).optional(), note: z.string().max(240).nullish() }),
        handler: (input: Parameters<typeof updateItem>[0]) => updateItem(input)
      }
    },
    {
      channel: 'orders.removeItem',
      definition: {
        permission: 'pos.use',
        schema: z.object({ itemId: z.number().int().positive() }),
        handler: (input: { itemId: number }) => removeItem(input.itemId)
      }
    },
    {
      channel: 'orders.setDiscount',
      definition: {
        permission: 'orders.discount',
        schema: z.object({ orderId: z.number().int().positive(), discountCents: z.number().int().min(0), discountReason: z.string().max(120).nullish() }),
        handler: (input: Parameters<typeof setDiscount>[0]) => setDiscount(input)
      }
    },
    {
      channel: 'orders.setNote',
      definition: {
        permission: 'pos.use',
        schema: z.object({ orderId: z.number().int().positive(), note: z.string().max(240).nullish() }),
        handler: (input: Parameters<typeof setNote>[0]) => setNote(input)
      }
    },
    {
      channel: 'orders.setStatus',
      definition: {
        permission: 'pos.use',
        schema: z.object({ orderId: z.number().int().positive(), status: z.string().min(1).max(24), note: z.string().max(240).nullish() }),
        handler: (input: Parameters<typeof setStatus>[0]) => setStatus(input)
      }
    },
    {
      channel: 'orders.sendToKitchen',
      definition: {
        permission: 'pos.use',
        schema: z.object({ orderId: z.number().int().positive() }),
        handler: (input: { orderId: number }) => sendToKitchen(input.orderId)
      }
    },
    {
      channel: 'orders.hold',
      definition: {
        permission: 'pos.use',
        schema: z.object({ orderId: z.number().int().positive() }),
        handler: (input: { orderId: number }) => holdOrder(input.orderId)
      }
    },
    {
      channel: 'orders.resume',
      definition: {
        permission: 'pos.use',
        schema: z.object({ orderId: z.number().int().positive() }),
        handler: (input: { orderId: number }) => resumeOrder(input.orderId)
      }
    },
    {
      channel: 'orders.pay',
      definition: {
        permission: 'orders.close',
        schema: z.object({
          orderId: z.number().int().positive(),
          payments: z.array(z.object({ method: z.string().min(1).max(24), amountCents: z.number().int(), reference: z.string().max(80).nullish() })).min(1),
          closeNow: z.boolean().optional()
        }),
        handler: (input: Parameters<typeof payOrder>[0]) => payOrder(input)
      }
    },
    {
      /* Handing over a paid order. Separate from paying, because a counter takes
         the money first and gives the food out later. */
      channel: 'orders.complete',
      definition: {
        permission: 'pos.use',
        schema: z.object({ orderId: z.number().int().positive() }),
        handler: (input: { orderId: number }) => completeOrder(input.orderId)
      }
    },
    {
      channel: 'orders.cancel',
      definition: {
        permission: 'orders.cancel',
        schema: z.object({ orderId: z.number().int().positive(), reason: z.string().min(1).max(240), stockPolicy: z.string().max(24).nullish() }),
        handler: (input: Parameters<typeof cancelOrder>[0]) => cancelOrder(input)
      }
    },
    {
      channel: 'orders.moveTable',
      definition: {
        permission: 'pos.use',
        schema: z.object({ orderId: z.number().int().positive(), tableId: z.number().int().positive().nullable() }),
        handler: (input: Parameters<typeof moveTable>[0]) => moveTable(input)
      }
    },
    {
      channel: 'orders.merge',
      definition: {
        permission: 'pos.use',
        schema: z.object({ fromOrderId: z.number().int().positive(), toOrderId: z.number().int().positive() }),
        handler: (input: Parameters<typeof mergeOrders>[0]) => mergeOrders(input)
      }
    },
    {
      channel: 'orders.receipt',
      definition: {
        permission: 'orders.view',
        schema: z.object({ orderId: z.number().int().positive(), language: z.string().max(4), paper: z.string().max(8) }),
        handler: (input: { orderId: number; language: string; paper: string }) => {
          /* The same builder the sales screen prints from: a ticket made here
             must carry the restaurant's identity, its VAT and stamp lines and
             the fiscal number, or it is not a receipt the law recognises. */
          const order = buildOrder(input.orderId)
          const paper = input.paper === '58' || input.paper === 'a4' ? input.paper : '80'
          const language = input.language === 'fr' ? 'fr' : 'ar'
          return { html: receiptHtml(order, getSettings(), language, paper) }
        }
      }
    },

    // Kitchen
    {
      channel: 'kitchen.board',
      definition: {
        permission: 'kitchen.view',
        schema: z.object({ station: z.string().max(24).nullish() }).default({}),
        handler: (input: { station?: string | null }) => kitchenBoard(input)
      }
    },
    {
      channel: 'kitchen.itemStatus',
      definition: {
        permission: 'kitchen.update',
        schema: z.object({ itemId: z.number().int().positive(), status: z.string().min(1).max(24) }),
        handler: (input: { itemId: number; status: string }) => setItemKitchenStatus(input)
      }
    },

    // Customers
    { channel: 'customers.list', definition: { permission: ['pos.use', 'customers.manage'], handler: () => listCustomers() } },
    {
      channel: 'customers.get',
      definition: { permission: ['pos.use', 'customers.manage'], schema: z.object({ id: z.number().int().positive() }), handler: (input: { id: number }) => getCustomer(input.id) }
    },
    {
      channel: 'customers.save',
      definition: {
        permission: 'customers.manage',
        schema: z.object({ id: z.number().int().positive().optional(), name: z.string().min(1).max(120), phone: z.string().max(40).nullish(), address: z.string().max(240).nullish(), area: z.string().max(80).nullish(), notes: z.string().max(400).nullish() }),
        handler: (input: Parameters<typeof saveCustomer>[0]) => saveCustomer(input)
      }
    },
    {
      channel: 'customers.toggleFavorite',
      definition: { permission: 'customers.manage', schema: z.object({ id: z.number().int().positive(), favorite: z.boolean() }), handler: (input: { id: number; favorite: boolean }) => toggleFavorite(input) }
    },
    {
      channel: 'customers.adjustLoyalty',
      definition: { permission: 'customers.manage', schema: z.object({ id: z.number().int().positive(), delta: z.number().int() }), handler: (input: { id: number; delta: number }) => adjustLoyalty(input) }
    },

    // Printing (any signed-in user)
    { channel: 'print.printers', definition: { handler: () => listPrinters() } },
    {
      channel: 'print.html',
      definition: {
        schema: z.object({ html: z.string().max(2_000_000), printerName: z.string().max(160).optional(), silent: z.boolean().optional() }),
        handler: (input: Parameters<typeof printHtml>[0]) => printHtml(input)
      }
    },
    {
      channel: 'print.exportPdf',
      definition: { schema: z.object({ html: z.string().max(2_000_000) }), handler: (input: { html: string }) => exportPdf(input) }
    },

    // Website (online ordering)
    { channel: 'website.state', definition: { permission: 'settings.manage', handler: () => getWebsiteState() } },
    {
      channel: 'website.config',
      definition: {
        permission: 'settings.manage',
        schema: z.object({
          theme: z.enum(['ember', 'noir', 'sable', 'nar']).optional(),
          isOpen: z.boolean().optional(),
          port: z.number().int().min(1024).max(65535).optional(),
          orderTypes: z.array(z.enum(['delivery', 'takeaway'])).min(1).optional(),
          closedMessageAr: z.string().max(240).optional(),
          closedMessageFr: z.string().max(240).optional()
        }),
        handler: (input: Parameters<typeof setWebsiteConfig>[0]) => setWebsiteConfig(input)
      }
    },
    { channel: 'website.start', definition: { permission: 'settings.manage', handler: () => startSite() } },
    { channel: 'website.stop', definition: { permission: 'settings.manage', handler: () => stopSite() } },
    { channel: 'website.export', definition: { permission: 'settings.manage', handler: () => exportSite() } },
    { channel: 'website.orders', definition: { permission: 'orders.view', handler: () => webOrders() } },

    // Branches (multi-site)
    {
      channel: 'branches.list',
      definition: {
        permission: ['pos.use', 'settings.manage'],
        schema: z.object({ includeInactive: z.boolean().optional() }).default({}),
        handler: (input: { includeInactive?: boolean }) => listBranches(Boolean(input.includeInactive))
      }
    },
    {
      channel: 'branches.save',
      definition: {
        permission: 'settings.manage',
        schema: z.object({
          id: z.number().int().positive().optional(),
          nameAr: z.string().min(1).max(120),
          nameFr: z.string().max(120),
          address: z.string().max(240).nullish(),
          phone: z.string().max(40).nullish(),
          hours: hoursSchema,
          deliveryNote: z.string().max(240).nullish(),
          sortOrder: z.number().int().min(0).optional()
        }),
        handler: (input: Parameters<typeof saveBranch>[0]) => saveBranch(input)
      }
    },
    {
      channel: 'branches.setOpen',
      definition: {
        permission: ['pos.use', 'settings.manage'],
        schema: z.object({ id: z.number().int().positive(), isOpen: z.boolean() }),
        handler: (input: { id: number; isOpen: boolean }) => setBranchOpen(input.id, input.isOpen)
      }
    },
    {
      channel: 'branches.setActive',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ id: z.number().int().positive(), active: z.boolean() }),
        handler: (input: { id: number; active: boolean }) => setBranchActive(input.id, input.active)
      }
    },
    {
      channel: 'branches.overrides',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ branchId: z.number().int().positive() }),
        handler: (input: { branchId: number }) => listOverrides(input.branchId)
      }
    },
    {
      channel: 'branches.setOverride',
      definition: {
        permission: 'settings.manage',
        schema: z.object({
          branchId: z.number().int().positive(),
          productId: z.number().int().positive(),
          priceCents: z.number().int().min(0).nullish(),
          isAvailable: z.boolean().nullish()
        }),
        handler: (input: Parameters<typeof setOverride>[0]) => setOverride(input)
      }
    }
  ])
