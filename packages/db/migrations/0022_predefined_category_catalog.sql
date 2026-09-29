ALTER TABLE "categories" ADD COLUMN "is_predefined" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

UPDATE categories
SET is_predefined = true
WHERE name IN (
  'Steel & Metal Products', 'Electrical & Wiring', 'Mechanical Parts & Fasteners',
  'Industrial Chemicals', 'Packaging Materials', 'MRO & Consumables', 'Pipes & Fittings',
  'Bearings & Power Transmission', 'Paints & Coatings', 'Safety & PPE', 'Tools & Machinery',
  'Logistics & Transport', 'Body & Structure', 'Braking', 'Steering', 'Suspension',
  'Wheel & Tire', 'Electronics', 'ADAS', 'Electrical', 'EV Powertrain', 'Thermal Management',
  'Lighting', 'Interior', 'Safety', 'Fasteners', 'Sealing', 'Glazing', 'Consumables',
  'Agriculture & Farming', 'Apparel, Clothing & Garments', 'Automobile Parts & Spares',
  'Ayurvedic & Herbal Products', 'Bags, Belts & Wallets', 'Books, Stationery & Office Supplies',
  'Building & Construction Materials', 'Business & Professional Services', 'Chemicals, Dyes & Solvents',
  'Computer Hardware & Peripherals', 'Consumer Electronics & Appliances',
  'Electrical Equipment & Supplies', 'Electronic Components & Supplies',
  'Energy, Power & Renewable Systems', 'Food & Beverages', 'Furniture & Furnishings',
  'Gems, Jewellery & Handicrafts', 'Hand Tools & Power Tools', 'Healthcare & Medical Supplies',
  'Home Supplies & Housekeeping', 'Hospitality & Commercial Kitchen Equipment',
  'Industrial Machinery & Equipment', 'IT, Telecom & Networking', 'Laboratory & Testing Equipment',
  'Leather Products', 'Mechanical Components & Assemblies', 'Minerals, Metals & Alloys',
  'Packaging Machines & Materials', 'Paper & Paper Products', 'Petroleum, Oils & Lubricants',
  'Pharmaceuticals & Medicines', 'Pipes, Tubes & Fittings', 'Plastics, PVC & Polymers',
  'Printing & Publishing Equipment', 'Railway, Shipping & Aviation Supplies',
  'Rubber & Rubber Products', 'Safety, Security & Surveillance', 'Scientific Instruments & Equipment',
  'Sports Goods & Fitness Equipment', 'Textiles, Yarns & Fabrics', 'Transport, Logistics & Warehousing',
  'Water Treatment & Environmental Systems'
);
