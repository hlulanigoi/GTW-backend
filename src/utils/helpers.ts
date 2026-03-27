import bcrypt from "bcryptjs";
import axios from "axios";
import config from "../config";

// Password utilities
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function comparePasswords(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Geocoding utilities
export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const response = await axios.get(`${config.nominatimApi}/search`, {
      params: {
        q: address,
        format: "json",
      },
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
      };
    }

    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await axios.get(`${config.nominatimApi}/reverse`, {
      params: {
        lat,
        lon: lng,
        format: "json",
      },
    });

    return response.data?.address?.address || null;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

// Distance calculation (Haversine formula)
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Paystack utilities
export interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export async function initializePaystackTransaction(
  email: string,
  amount: number,
  metadata?: Record<string, any>
): Promise<PaystackInitResponse> {
  const response = await axios.post(
    "https://api.paystack.co/transaction/initialize",
    {
      email,
      amount: Math.round(amount * 100), // Convert to kobo
      metadata,
    },
    {
      headers: {
        Authorization: `Bearer ${config.paystack.secretKey}`,
      },
    }
  );

  return response.data;
}

export async function verifyPaystackTransaction(
  reference: string
): Promise<any> {
  const response = await axios.get(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${config.paystack.secretKey}`,
      },
    }
  );

  return response.data;
}

export async function chargeAuthorization(
  authorizationCode: string,
  email: string,
  amount: number,
  metadata?: Record<string, any>
): Promise<any> {
  const response = await axios.post(
    "https://api.paystack.co/transaction/charge_authorization",
    {
      authorization_code: authorizationCode,
      email,
      amount: Math.round(amount * 100), // Convert to kobo
      metadata,
    },
    {
      headers: {
        Authorization: `Bearer ${config.paystack.secretKey}`,
      },
    }
  );

  return response.data;
}

export function validatePaystackWebhookSignature(
  body: string,
  signature: string
): boolean {
  const crypto = require("crypto");
  const hash = crypto
    .createHmac("sha512", config.paystack.webhookSecret!)
    .update(body)
    .digest("hex");

  return hash === signature;
}

// Subscription tier utilities
export const subscriptionTiers = {
  starter: {
    monthlyParcelLimit: 5,
    platformFeePercent: 10,
    price: 0,
  },
  professional: {
    monthlyParcelLimit: 50,
    platformFeePercent: 7,
    price: 499, // ZAR
  },
  business: {
    monthlyParcelLimit: null, // Unlimited
    platformFeePercent: 5,
    price: 1999, // ZAR
  },
};

export type SubscriptionTier = keyof typeof subscriptionTiers;

// Utility function to calculate platform fee
export function calculatePlatformFee(
  amount: number,
  tier: SubscriptionTier
): number {
  const feePercent = subscriptionTiers[tier].platformFeePercent;
  return Math.round((amount * feePercent) / 100 * 100) / 100;
}

// Generate confirmation token
export function generateConfirmationToken(): string {
  const crypto = require("crypto");
  return crypto.randomBytes(32).toString("hex");
}
