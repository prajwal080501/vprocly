ALTER TABLE "sourcing_lines" ADD COLUMN "brand_manufacturer" text;
--> statement-breakpoint
ALTER TABLE "sourcing_lines" ADD COLUMN "hsn_mfg_code" text;
--> statement-breakpoint

-- Broad top-level marketplace taxonomy inspired by the category families buyers and suppliers use on
-- Indian B2B marketplaces. Existing specialized categories remain available alongside these entries.
INSERT INTO categories (id, name) VALUES
  (gen_random_uuid(), 'Agriculture & Farming'),
  (gen_random_uuid(), 'Apparel, Clothing & Garments'),
  (gen_random_uuid(), 'Automobile Parts & Spares'),
  (gen_random_uuid(), 'Ayurvedic & Herbal Products'),
  (gen_random_uuid(), 'Bags, Belts & Wallets'),
  (gen_random_uuid(), 'Books, Stationery & Office Supplies'),
  (gen_random_uuid(), 'Building & Construction Materials'),
  (gen_random_uuid(), 'Business & Professional Services'),
  (gen_random_uuid(), 'Chemicals, Dyes & Solvents'),
  (gen_random_uuid(), 'Computer Hardware & Peripherals'),
  (gen_random_uuid(), 'Consumer Electronics & Appliances'),
  (gen_random_uuid(), 'Electrical Equipment & Supplies'),
  (gen_random_uuid(), 'Electronic Components & Supplies'),
  (gen_random_uuid(), 'Energy, Power & Renewable Systems'),
  (gen_random_uuid(), 'Food & Beverages'),
  (gen_random_uuid(), 'Furniture & Furnishings'),
  (gen_random_uuid(), 'Gems, Jewellery & Handicrafts'),
  (gen_random_uuid(), 'Hand Tools & Power Tools'),
  (gen_random_uuid(), 'Healthcare & Medical Supplies'),
  (gen_random_uuid(), 'Home Supplies & Housekeeping'),
  (gen_random_uuid(), 'Hospitality & Commercial Kitchen Equipment'),
  (gen_random_uuid(), 'Industrial Machinery & Equipment'),
  (gen_random_uuid(), 'IT, Telecom & Networking'),
  (gen_random_uuid(), 'Laboratory & Testing Equipment'),
  (gen_random_uuid(), 'Leather Products'),
  (gen_random_uuid(), 'Mechanical Components & Assemblies'),
  (gen_random_uuid(), 'Minerals, Metals & Alloys'),
  (gen_random_uuid(), 'Packaging Machines & Materials'),
  (gen_random_uuid(), 'Paper & Paper Products'),
  (gen_random_uuid(), 'Petroleum, Oils & Lubricants'),
  (gen_random_uuid(), 'Pharmaceuticals & Medicines'),
  (gen_random_uuid(), 'Pipes, Tubes & Fittings'),
  (gen_random_uuid(), 'Plastics, PVC & Polymers'),
  (gen_random_uuid(), 'Printing & Publishing Equipment'),
  (gen_random_uuid(), 'Railway, Shipping & Aviation Supplies'),
  (gen_random_uuid(), 'Rubber & Rubber Products'),
  (gen_random_uuid(), 'Safety, Security & Surveillance'),
  (gen_random_uuid(), 'Scientific Instruments & Equipment'),
  (gen_random_uuid(), 'Sports Goods & Fitness Equipment'),
  (gen_random_uuid(), 'Textiles, Yarns & Fabrics'),
  (gen_random_uuid(), 'Transport, Logistics & Warehousing'),
  (gen_random_uuid(), 'Water Treatment & Environmental Systems')
ON CONFLICT (name) DO NOTHING;
