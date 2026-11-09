import { z } from 'zod'
import {
  addItem,
  buildOrder,
  cancelOrder,
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
import { registerMany } from '../registry'

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
        schema: z.object({ status: z.string().max(24).nullish(), limit: z.number().int().positive().max(500).optional() }).default({}),
        handler: (input: { status?: string | null; limit?: number }) => listOrders(input)
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
          payments: z.array(z.object({ method: z.string().min(1).max(24), amountCents: z.number().int(), reference: z.string().max(80).nullish() })).min(1)
        }),
        handler: (input: Parameters<typeof payOrder>[0]) => payOrder(input)
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
        handler: (input: { orderId: number; language: string }) => {
          const order = buildOrder(input.orderId)
          const rows = order.items
            .map((i) => `<tr><td>${i.qty}× ${input.language === 'ar' ? i.productNameAr : i.productNameFr}</td><td style="text-align:end">${(i.lineTotalCents / 100).toFixed(2)}</td></tr>`)
            .join('')
          return {
            html: `<html dir="${input.language === 'ar' ? 'rtl' : 'ltr'}"><body style="font-family:sans-serif;width:280px"><h3>${order.orderNumber}</h3><table style="width:100%">${rows}</table><hr><p style="text-align:end"><b>${(order.totalCents / 100).toFixed(2)} DZD</b></p></body></html>`
          }
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
    }
  ])
