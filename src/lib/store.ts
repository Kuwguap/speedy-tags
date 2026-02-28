export interface Service {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
}

export interface Order {
  id: string;
  serviceId: string;
  serviceTitle: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  deliveryAddress: string;
  vin: string;
  carMakeModel: string;
  color: string;
  price: number;
  createdAt: string;
}

const SERVICES_KEY = "cartags_services";
const ORDERS_KEY = "cartags_orders";

const defaultServices: Service[] = [
  {
    id: "1",
    title: "Same Day NJ Temporary Tag",
    description: "Temp plate + registration + insurance card. 30-day validity. Processed through NJ MVC. Instant email or 1-hour local delivery.",
    price: 150.0,
    image: "",
  },
  {
    id: "2",
    title: "30-Day Temporary Tag",
    description: "Standard temporary registration valid for 30 days. Perfect for newly purchased vehicles awaiting permanent plates.",
    price: 29.99,
    image: "",
  },
  {
    id: "3",
    title: "60-Day Temporary Tag",
    description: "Extended temporary registration valid for 60 days. Ideal for out-of-state transfers and extended processing times.",
    price: 49.99,
    image: "",
  },
  {
    id: "4",
    title: "Transit Permit",
    description: "One-trip transit permit for moving unregistered vehicles. Valid for a single trip to your destination.",
    price: 19.99,
    image: "",
  },
];

export function getServices(): Service[] {
  const stored = localStorage.getItem(SERVICES_KEY);
  if (stored) return JSON.parse(stored);
  localStorage.setItem(SERVICES_KEY, JSON.stringify(defaultServices));
  return defaultServices;
}

export function saveServices(services: Service[]) {
  localStorage.setItem(SERVICES_KEY, JSON.stringify(services));
}

export function addService(service: Omit<Service, "id">): Service {
  const services = getServices();
  const newService = { ...service, id: Date.now().toString() };
  services.push(newService);
  saveServices(services);
  return newService;
}

export function deleteService(id: string) {
  const services = getServices().filter((s) => s.id !== id);
  saveServices(services);
}

export function getOrders(): Order[] {
  const stored = localStorage.getItem(ORDERS_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function addOrder(order: Omit<Order, "id" | "createdAt">): Order {
  const orders = getOrders();
  const newOrder = { ...order, id: Date.now().toString(), createdAt: new Date().toISOString() };
  orders.push(newOrder);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  return newOrder;
}
