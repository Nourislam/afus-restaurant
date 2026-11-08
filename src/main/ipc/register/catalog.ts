import { z } from 'zod'
import {
  archiveCategory,
  archiveProduct,
  getProduct,
  listCategories,
  listModifierGroups,
  listProducts,
  removeModifierGroup,
  saveCategory,
  saveModifierGroup,
  saveProduct,
  setProductAvailability
} from '../../services/catalog'
import { archiveArea, listAreas, listTables, removeTable, saveArea, saveTable, setTableStatus, tableMap } from '../../services/venue'
import { registerMany } from '../registry'

export const catalogChannels = () =>
  registerMany([
    {
      channel: 'tables.list',
      definition: { permission: ['tables.manage', 'pos.use'], handler: () => listTables() }
    },
    {
      channel: 'tables.map',
      definition: { permission: ['tables.manage', 'pos.use'], handler: () => tableMap() }
    },
    {
      channel: 'tables.save',
      definition: {
        permission: 'tables.manage',
        schema: z.object({
          id: z.number().int().positive().optional(),
          areaId: z.number().int().positive(),
          name: z.string().min(1).max(32),
          seats: z.number().int().min(1).max(50).optional(),
          positionX: z.number().optional(),
          positionY: z.number().optional()
        }),
        handler: (input: Parameters<typeof saveTable>[0]) => saveTable(input)
      }
    },
    {
      channel: 'tables.setStatus',
      definition: {
        permission: 'tables.manage',
        schema: z.object({ id: z.number().int().positive(), status: z.string().min(1).max(24) }),
        handler: (input: { id: number; status: string }) => setTableStatus(input.id, input.status)
      }
    },
    {
      channel: 'tables.remove',
      definition: {
        permission: 'tables.manage',
        schema: z.object({ id: z.number().int().positive() }),
        handler: (input: { id: number }) => removeTable(input.id)
      }
    },
    { channel: 'areas.list', definition: { permission: ['tables.manage', 'pos.use'], handler: () => listAreas() } },
    {
      channel: 'areas.save',
      definition: {
        permission: 'tables.manage',
        schema: z.object({
          id: z.number().int().positive().optional(),
          nameAr: z.string().min(1).max(60),
          nameFr: z.string().min(1).max(60),
          color: z.string().max(9).optional(),
          sortOrder: z.number().int().optional()
        }),
        handler: (input: Parameters<typeof saveArea>[0]) => saveArea(input)
      }
    },
    {
      channel: 'areas.archive',
      definition: {
        permission: 'tables.manage',
        schema: z.object({ id: z.number().int().positive() }),
        handler: (input: { id: number }) => archiveArea(input.id)
      }
    },
    {
      channel: 'categories.list',
      definition: {
        permission: 'menu.view',
        schema: z.object({ includeArchived: z.boolean().optional() }).default({}),
        handler: (input: { includeArchived?: boolean }) => listCategories(input.includeArchived)
      }
    },
    {
      channel: 'categories.save',
      definition: {
        permission: 'menu.manage',
        schema: z.object({
          id: z.number().int().positive().optional(),
          nameAr: z.string().min(1).max(60),
          nameFr: z.string().min(1).max(60),
          kind: z.string().max(24).optional(),
          color: z.string().max(9).optional(),
          sortOrder: z.number().int().optional()
        }),
        handler: (input: Parameters<typeof saveCategory>[0]) => saveCategory(input)
      }
    },
    {
      channel: 'categories.archive',
      definition: {
        permission: 'menu.manage',
        schema: z.object({ id: z.number().int().positive() }),
        handler: (input: { id: number }) => archiveCategory(input.id)
      }
    },
    {
      channel: 'products.list',
      definition: {
        permission: 'menu.view',
        schema: z
          .object({
            page: z.number().int().min(1).optional(),
            pageSize: z.number().int().min(1).max(200).optional(),
            search: z.string().max(80).nullish(),
            categoryId: z.number().int().positive().nullish(),
            includeArchived: z.boolean().optional()
          })
          .default({}),
        handler: (input: Parameters<typeof listProducts>[0]) => listProducts(input ?? {})
      }
    },
    {
      channel: 'products.get',
      definition: {
        permission: 'menu.view',
        schema: z.object({ id: z.number().int().positive() }),
        handler: (input: { id: number }) => getProduct(input.id)
      }
    },
    {
      channel: 'products.save',
      definition: {
        permission: 'menu.manage',
        schema: z.object({
          id: z.number().int().positive().optional(),
          code: z.string().max(32).nullish(),
          nameAr: z.string().min(1).max(80),
          nameFr: z.string().min(1).max(80),
          descriptionAr: z.string().max(400).nullish(),
          descriptionFr: z.string().max(400).nullish(),
          image: z.string().max(400000).nullish(),
          categoryId: z.number().int().positive(),
          type: z.string().max(24).optional(),
          priceCents: z.number().int().min(0),
          costCents: z.number().int().min(0).optional(),
          prepMinutes: z.number().int().min(0).max(600).optional(),
          station: z.string().max(24).optional(),
          isAvailable: z.boolean().optional(),
          sortOrder: z.number().int().optional(),
          variants: z
            .array(
              z.object({
                id: z.number().int().positive().optional(),
                nameAr: z.string().min(1).max(60),
                nameFr: z.string().min(1).max(60),
                priceDeltaCents: z.number().int().optional(),
                isDefault: z.boolean().optional(),
                sortOrder: z.number().int().optional()
              })
            )
            .optional()
        }),
        handler: (input: Parameters<typeof saveProduct>[0]) => saveProduct(input)
      }
    },
    {
      channel: 'products.setAvailability',
      definition: {
        permission: 'menu.manage',
        schema: z.object({ id: z.number().int().positive(), available: z.boolean() }),
        handler: (input: { id: number; available: boolean }) => setProductAvailability(input.id, input.available)
      }
    },
    {
      channel: 'products.archive',
      definition: {
        permission: 'menu.manage',
        schema: z.object({ id: z.number().int().positive() }),
        handler: (input: { id: number }) => archiveProduct(input.id)
      }
    },
    { channel: 'modifierGroups.list', definition: { permission: 'menu.view', handler: () => listModifierGroups() } },
    {
      channel: 'modifierGroups.save',
      definition: {
        permission: 'menu.manage',
        schema: z.object({
          id: z.number().int().positive().optional(),
          nameAr: z.string().min(1).max(60),
          nameFr: z.string().min(1).max(60),
          minSelect: z.number().int().min(0).optional(),
          maxSelect: z.number().int().min(1).optional(),
          isRequired: z.boolean().optional(),
          sortOrder: z.number().int().optional(),
          modifiers: z
            .array(
              z.object({
                id: z.number().int().positive().optional(),
                nameAr: z.string().min(1).max(60),
                nameFr: z.string().min(1).max(60),
                priceCents: z.number().int().optional(),
                isActive: z.boolean().optional(),
                sortOrder: z.number().int().optional()
              })
            )
            .optional()
        }),
        handler: (input: Parameters<typeof saveModifierGroup>[0]) => saveModifierGroup(input)
      }
    },
    {
      channel: 'modifierGroups.remove',
      definition: {
        permission: 'menu.manage',
        schema: z.object({ id: z.number().int().positive() }),
        handler: (input: { id: number }) => removeModifierGroup(input.id)
      }
    }
  ])
