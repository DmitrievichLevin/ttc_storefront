import z from 'zod';
import { AddressSchema, ISO8601Schema } from './address.schema';
import { IOrder, OrderSchema } from './order.schema';
import validate from '../utils/validate';
import { getAuth } from 'firebase-admin/auth';
import { CreateUserBase, IUserLoginData, UserQuery } from '../lib/shopify';


export interface IShopifyUser {
  id: string;
  fuid: { value: FirebaseUid };
  phone: string;
  firstName: string;
  lastName: string;
  defaultAddress?: IShopifyAddress;
  lastOrder?: IOrder;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/**
 * 1. Hardened Schemas
 */
const UserMetadataSchema = z.object({
  createdAt: ISO8601Schema,
  updatedAt: ISO8601Schema
});

export const UserSchema = z.object({
  id: z.string().min(1), // Fixed syntax
  fuid: z.string().min(28),
  fullName: z.string().trim().min(1),
  phone: z.string().trim().regex(/^\+?1?\d{10}$/, "Invalid US Phone Format"),
  defaultAddress: AddressSchema.optional(),
  lastOrder: OrderSchema.optional(),
  metadata: UserMetadataSchema
}).strict();

export type IUser = z.infer<typeof UserSchema>;

/**
 * 2. Result Type for Concurrency Safety
 */
interface UserLookupResult {
  user: IUser | null;
  // Only provided if the user was looked up via a valid Token but doesn't exist yet
  create?: (newData: IUserLoginData) => Promise<UserLookupResult>;
}

interface UserInterface {
  (data: string): Promise<UserLookupResult>;
  schema: typeof UserSchema;
  safeParse: (data: unknown) => ReturnType<typeof UserSchema.safeParse>;
}


const UserBase = (async (data: string): Promise<UserLookupResult> => {
  let rawUser: any = null; // Replace with IShopifyUser once types are solid
  let verifiedFuid: FirebaseUid | null = null;

  // 1. Identify the Input Type
  if (validate.isFirebaseIdToken(data)) {
    const decodedToken = await getAuth().verifyIdToken(data);
    verifiedFuid = decodedToken.uid as FirebaseUid;
    const phone = decodedToken.phone_number;
    rawUser = await UserQuery(phone as UsPhoneNumber);
  }
  else if (validate.isUsPhoneNumber(data)) {
    rawUser = await UserQuery(data);
  }
  else if (validate.isShopifyCustomerId(data)) {
    rawUser = await UserQuery(data);
  }
  else if (validate.isFirebaseUid(data)) {
    rawUser = await UserQuery(data);
  }
  else {
    throw new Error("[User Utility]: Invalid identifier format.");
  }

  // 2. Return User if found
  if (rawUser) {
    const user: IUser = {
      id: rawUser.id,
      fullName: `${rawUser.firstName} ${rawUser.lastName}`.trim(),
      phone: rawUser.phone,
      fuid: typeof rawUser.fuid === 'object' ? rawUser.fuid.value : rawUser.fuid,
      defaultAddress: rawUser.defaultAddress,
      lastOrder: rawUser.lastOrder,
      metadata: {
        createdAt: rawUser.createdAt,
        updatedAt: rawUser.updatedAt
      }
    };
    return { user };
  }

  // 3. Handle Registration Path
  // If no user was found but we have a verified FUID from a token, provide the create method
  if (verifiedFuid) {
    return {
      user: null,
      create: async (newData: IUserLoginData) => {
        const created = await CreateUserBase({ ...newData, fuid: verifiedFuid! });
        if (!created) throw new Error("Failed to create user in Shopify.");

        return {
          user: {
            id: created.id,
            fullName: `${created.firstName} ${created.lastName}`.trim(),
            phone: created.phone,
            fuid: typeof created.fuid === 'object' ? created.fuid.value : created.fuid,
            defaultAddress: created.defaultAddress,
            lastOrder: created.lastOrder,
            metadata: {
              createdAt: created.createdAt,
              updatedAt: created.updatedAt
            }
          } as IUser
        };
      }
    };
  }

  return { user: null };
}) as UserInterface;

export const User = Object.assign(UserBase, {
  schema: UserSchema,
  safeParse: (data: unknown) => UserSchema.safeParse(data),
});