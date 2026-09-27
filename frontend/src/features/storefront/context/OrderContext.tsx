import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

import type { Order } from '../data/mockData';
import { mockOrders } from '../data/demoOrders';

interface OrderContextValue {
  orders: Order[];
  addOrder: (order: Order) => void;
}

const OrderContext =
  createContext<OrderContextValue | null>(null);

const STORAGE_KEY = 'ecommerce-demo-orders';

function getInitialOrders(): Order[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return mockOrders;
    }

    const savedOrders = JSON.parse(stored) as Order[];

    /*
     * Conservamos los pedidos creados durante la sesión
     * junto con los pedidos demo.
     */
    const savedIds = new Set(
      savedOrders.map((order) => order.id),
    );

    const missingMockOrders = mockOrders.filter(
      (order) => !savedIds.has(order.id),
    );

    return [...savedOrders, ...missingMockOrders];
  } catch {
    return mockOrders;
  }
}

export function OrderProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [orders, setOrders] =
    useState<Order[]>(getInitialOrders);

  const addOrder = (order: Order) => {
    setOrders((previous) => {
      const updatedOrders = [
        order,
        ...previous.filter(
          (existingOrder) =>
            existingOrder.id !== order.id,
        ),
      ];

      try {
        /*
         * Guardamos solamente los pedidos creados,
         * no es necesario duplicar los mock.
         */
        const demoIds = new Set(
          mockOrders.map(
            (demoOrder) => demoOrder.id,
          ),
        );

        const createdOrders =
          updatedOrders.filter(
            (currentOrder) =>
              !demoIds.has(currentOrder.id),
          );

        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(createdOrders),
        );
      } catch {
        /*
         * Si sessionStorage no está disponible,
         * el pedido seguirá funcionando mientras
         * el contexto permanezca montado.
         */
      }

      return updatedOrders;
    });
  };

  return (
    <OrderContext.Provider
      value={{
        orders,
        addOrder,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);

  if (!context) {
    throw new Error(
      'OrderProvider requerido',
    );
  }

  return context;
}