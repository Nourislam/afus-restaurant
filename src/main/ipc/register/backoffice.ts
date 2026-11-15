import { z } from 'zod'
import { adjustIngredient, listIngredients, listMovements, removeIngredient, saveIngredient, wasteIngredient } from '../../services/inventory'
import { getRecipe, saveRecipe } from '../../services/recipes'
import { archiveSupplier, cancelPurchase, getPurchase, getSupplier, listPurchases, listSuppliers, paySupplier, receivePurchase, savePurchase, saveSupplier } from '../../services/purchases'
import { listDeliveries, saveDelivery, setDeliveryStatus } from '../../services/delivery'
import { listReservations, saveReservation, setReservationStatus } from '../../services/reservations'
import { clock, listAttendance } from '../../services/attendance'
import { registerMany } from '../registry'

const id = z.number().int().positive()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const optionalText = (max: number) => z.string().max(max).nullable().optional()
const listRange = z.object({ from: day.optional(), to: day.optional(), status: z.string().max(24).optional(), search: z.string().max(80).optional(), limit: z.number().int().min(1).max(2000).optional() })

export const backofficeChannels = () =>
  registerMany([
    /* ---------------- Ingredients ---------------- */
    {
      channel: 'ingredients.list',
      definition: {
        permission: ['inventory.view', 'recipes.view', 'purchases.view'],
        schema: z.object({ includeArchived: z.boolean().optional() }).passthrough(),
        handler: (input: { includeArchived?: boolean }) => listIngredients(input.includeArchived ?? false)
      }
    },
    {
      channel: 'ingredients.save',
      definition: {
        permission: 'inventory.manage',
        schema: z.object({
          id: id.optional(),
          nameAr: z.string().min(1).max(120),
          nameFr: z.string().max(120).optional().default(''),
          unit: z.enum(['g', 'kg', 'ml', 'l', 'piece', 'unit']),
          costPerUnitCents: z.number().int().min(0).optional(),
          minQty: z.number().min(0).optional(),
          openingQty: z.number().min(0).optional()
        }),
        handler: (input: Parameters<typeof saveIngredient>[0]) => saveIngredient(input)
      }
    },
    {
      channel: 'ingredients.adjust',
      definition: {
        permission: 'inventory.manage',
        schema: z.object({ id, qty: z.number().min(0), note: optionalText(200) }),
        handler: (input: { id: number; qty: number; note?: string | null }) => adjustIngredient(input.id, input.qty, input.note)
      }
    },
    {
      channel: 'ingredients.waste',
      definition: {
        permission: 'inventory.manage',
        schema: z.object({ id, qty: z.number().positive(), note: optionalText(200) }),
        handler: (input: { id: number; qty: number; note?: string | null }) => wasteIngredient(input.id, input.qty, input.note)
      }
    },
    {
      channel: 'ingredients.movements',
      definition: {
        permission: 'inventory.view',
        schema: z.object({ ingredientId: id.optional(), from: day.optional(), to: day.optional(), type: z.string().max(24).optional(), limit: z.number().int().min(1).max(2000).optional() }),
        handler: (input: Parameters<typeof listMovements>[0]) => listMovements(input)
      }
    },
    { channel: 'ingredients.remove', definition: { permission: 'inventory.manage', schema: z.object({ id }), handler: (input: { id: number }) => removeIngredient(input.id) } },

    /* ---------------- Recipes ---------------- */
    { channel: 'recipes.get', definition: { permission: 'recipes.view', schema: z.object({ productId: id }), handler: (input: { productId: number }) => getRecipe(input.productId) } },
    {
      channel: 'recipes.save',
      definition: {
        permission: 'recipes.manage',
        schema: z.object({
          productId: id,
          note: optionalText(300),
          items: z.array(z.object({ ingredientId: id, qty: z.number().positive().optional(), qtyBase: z.number().int().positive().optional(), note: optionalText(120) })).max(60)
        }),
        handler: (input: Parameters<typeof saveRecipe>[0]) => saveRecipe(input)
      }
    },

    /* ---------------- Suppliers ---------------- */
    { channel: 'suppliers.list', definition: { permission: ['suppliers.view', 'purchases.view'], schema: z.object({ includeArchived: z.boolean().optional() }).passthrough(), handler: (input: { includeArchived?: boolean }) => listSuppliers(input.includeArchived ?? false) } },
    { channel: 'suppliers.get', definition: { permission: ['suppliers.view', 'purchases.view'], schema: z.object({ id }), handler: (input: { id: number }) => getSupplier(input.id) } },
    {
      channel: 'suppliers.save',
      definition: {
        permission: 'suppliers.manage',
        schema: z.object({ id: id.optional(), name: z.string().min(1).max(120), phone: optionalText(32), address: optionalText(240), notes: optionalText(500) }),
        handler: (input: Parameters<typeof saveSupplier>[0]) => saveSupplier(input)
      }
    },
    { channel: 'suppliers.archive', definition: { permission: 'suppliers.manage', schema: z.object({ id, archived: z.boolean().optional() }), handler: (input: { id: number; archived?: boolean }) => archiveSupplier(input.id, input.archived ?? true) } },

    /* ---------------- Purchases ---------------- */
    { channel: 'purchases.list', definition: { permission: 'purchases.view', schema: listRange.extend({ supplierId: id.optional() }).passthrough(), handler: (input: Parameters<typeof listPurchases>[0]) => listPurchases(input) } },
    { channel: 'purchases.get', definition: { permission: 'purchases.view', schema: z.object({ id }), handler: (input: { id: number }) => getPurchase(input.id) } },
    {
      channel: 'purchases.save',
      definition: {
        permission: 'purchases.manage',
        schema: z.object({
          id: id.optional(),
          supplierId: id,
          invoiceNo: optionalText(60),
          purchaseDate: day.nullable().optional(),
          discountCents: z.number().int().min(0).optional(),
          extraCents: z.number().int().min(0).optional(),
          note: optionalText(500),
          items: z.array(z.object({ ingredientId: id, qty: z.number().positive(), unitCostCents: z.number().int().min(0) })).min(1).max(200)
        }),
        handler: (input: Parameters<typeof savePurchase>[0]) => savePurchase(input)
      }
    },
    { channel: 'purchases.receive', definition: { permission: 'purchases.manage', schema: z.object({ id }), handler: (input: { id: number }) => receivePurchase(input.id) } },
    { channel: 'purchases.cancel', definition: { permission: 'purchases.manage', schema: z.object({ id }), handler: (input: { id: number }) => cancelPurchase(input.id) } },
    {
      channel: 'purchases.pay',
      definition: {
        permission: ['purchases.manage', 'finance.manage'],
        schema: z.object({ supplierId: id, purchaseId: id.nullable().optional(), amountCents: z.number().int().positive(), method: z.string().min(1).max(24), note: optionalText(200) }),
        handler: (input: Parameters<typeof paySupplier>[0]) => paySupplier(input)
      }
    },

    /* ---------------- Delivery ---------------- */
    { channel: 'delivery.list', definition: { permission: ['delivery.manage', 'orders.view'], schema: listRange.passthrough(), handler: (input: Parameters<typeof listDeliveries>[0]) => listDeliveries(input) } },
    {
      channel: 'delivery.save',
      definition: {
        permission: 'delivery.manage',
        schema: z.object({ id, courier: optionalText(80), area: optionalText(80), note: optionalText(300), address: optionalText(240), phone: optionalText(32) }),
        handler: (input: Parameters<typeof saveDelivery>[0]) => saveDelivery(input)
      }
    },
    {
      channel: 'delivery.setStatus',
      definition: {
        permission: 'delivery.manage',
        schema: z.object({ id, status: z.enum(['pending', 'assigned', 'delivered', 'cancelled']), note: optionalText(300) }),
        handler: (input: { id: number; status: string; note?: string | null }) => setDeliveryStatus(input.id, input.status, input.note)
      }
    },

    /* ---------------- Reservations ---------------- */
    { channel: 'reservations.list', definition: { permission: ['reservations.manage', 'pos.use'], schema: listRange.passthrough(), handler: (input: Parameters<typeof listReservations>[0]) => listReservations(input) } },
    {
      channel: 'reservations.save',
      definition: {
        permission: 'reservations.manage',
        schema: z.object({
          id: id.optional(),
          customerName: z.string().min(1).max(120),
          phone: z.string().min(1).max(32),
          date: day,
          time: z.string().regex(/^\d{2}:\d{2}$/),
          partySize: z.number().int().min(1).max(200),
          tableId: id.nullable().optional(),
          note: optionalText(300),
          status: z.enum(['pending', 'confirmed', 'arrived', 'noShow', 'cancelled']).optional()
        }),
        handler: (input: Parameters<typeof saveReservation>[0]) => saveReservation(input)
      }
    },
    {
      channel: 'reservations.setStatus',
      definition: {
        permission: 'reservations.manage',
        schema: z.object({ id, status: z.enum(['pending', 'confirmed', 'arrived', 'noShow', 'cancelled']) }),
        handler: (input: { id: number; status: string }) => setReservationStatus(input.id, input.status)
      }
    },

    /* ---------------- Attendance ---------------- */
    { channel: 'attendance.list', definition: { permission: 'employees.manage', schema: z.object({ date: day }), handler: (input: { date: string }) => listAttendance(input.date) } },
    { channel: 'attendance.clock', definition: { schema: z.object({ type: z.enum(['in', 'out']), note: optionalText(200) }), handler: (input: { type: 'in' | 'out'; note?: string | null }) => clock(input) } }
  ])
