-- ============================================================
--  0009 — add hockey products to the catalogue
-- ============================================================
--  50 real hockey products read from the 2026 Hart Sport Buyer's
--  Guide (accurate SKU, name, price; category = 'Hockey'). Same
--  idempotent upsert-on-hart_sku pattern as 0005.
-- ============================================================

insert into public.hart_sport_products (hart_sku, name, category, unit_price)
values
    -- Hockey sticks
    ('11-150',     'HART Extreme 500 Hockey Stick (36.5")',     'Hockey', 34.90),
    ('11-153-30',  'HART School Hockey Stick (30")',            'Hockey', 19.90),
    ('11-153-32',  'HART School Hockey Stick (32")',            'Hockey', 19.90),
    ('11-153-34',  'HART School Hockey Stick (34")',            'Hockey', 19.90),
    ('11-153-36.5','HART School Hockey Stick (36.5")',          'Hockey', 19.90),
    ('11-120-B',   'HART Junior Indoor Hockey Stick (Blue)',    'Hockey', 17.50),
    ('11-120-G',   'HART Junior Indoor Hockey Stick (Green)',   'Hockey', 17.50),
    ('11-120-R',   'HART Junior Indoor Hockey Stick (Red)',     'Hockey', 17.50),
    ('11-120-Y',   'HART Junior Indoor Hockey Stick (Yellow)',  'Hockey', 17.50),
    ('11-125-G',   'HART Mini Indoor Hockey Stick (Fluro Green)',  'Hockey', 15.50),
    ('11-125-O',   'HART Mini Indoor Hockey Stick (Fluro Orange)', 'Hockey', 15.50),

    -- Hockey balls
    ('11-230-O',   'HART Extreme Dimple Hockey Ball (Orange)',  'Hockey', 9.60),
    ('11-230-Y',   'HART Extreme Dimple Hockey Ball (Yellow)',  'Hockey', 9.60),
    ('11-230-W',   'HART Extreme Dimple Hockey Ball (White)',   'Hockey', 9.60),
    ('11-230-P',   'HART Extreme Dimple Hockey Ball (Pink)',    'Hockey', 9.60),
    ('11-232',     'HART Glitter Hockey Ball',                  'Hockey', 6.60),
    ('11-233',     'HART Rainbow Hockey Ball',                  'Hockey', 6.60),
    ('11-208',     'HART Team Trainer Hockey Ball (White)',     'Hockey', 4.60),
    ('11-207',     'HART Minkey Ball',                          'Hockey', 5.60),
    ('5-682',      'HART Plastic Wiffle Ball (72mm)',           'Hockey', 1.90),
    ('33-116',     'HART Rainbow Wiffle Balls (Set of 6)',      'Hockey', 9.90),

    -- Goals
    ('9-829',      'HART Training Hockey Goal',                 'Hockey', 399.00),
    ('9-829-N',    'HART Training Hockey Goal Spare Net',       'Hockey', 159.00),
    ('11-420',     'HART Indoor Sports Goal',                   'Hockey', 349.00),
    ('11-420-N',   'HART Indoor Sports Goal Replacement Net',   'Hockey', 124.00),
    ('11-421',     'HART Mini Hockey Goal',                     'Hockey', 99.00),

    -- Goalie & protection
    ('11-300',     'HART Hockey Goalie Kit (Small)',            'Hockey', 499.00),
    ('11-301',     'HART Hockey Goalie Kit (Medium)',           'Hockey', 599.00),
    ('11-302',     'HART Hockey Goalie Kit (Large)',            'Hockey', 599.00),
    ('11-305',     'HART Hockey Face Mask',                     'Hockey', 79.00),
    ('11-333-L',   'HART Champion Shin Guards (Large)',         'Hockey', 18.50),
    ('11-333-M',   'HART Champion Shin Guards (Medium)',        'Hockey', 18.50),
    ('11-333-S',   'HART Champion Shin Guards (Small)',         'Hockey', 18.50),
    ('9-591',      'HART Blitz Mouthguard (Senior)',            'Hockey', 4.90),
    ('9-590',      'HART Blitz Mouthguard (Junior)',            'Hockey', 4.90),
    ('9-589-S',    'HART Armour Mouthguard (Senior)',           'Hockey', 4.90),
    ('9-589-J',    'HART Armour Mouthguard (Junior)',           'Hockey', 4.90),

    -- Accessories & coaching
    ('9-820',      'HART Captain Armband',                      'Hockey', 3.00),
    ('9-816',      'HART Referee Cards with Wallet',            'Hockey', 5.50),
    ('19-346',     'HART Multi Ball Pickup Tube',               'Hockey', 69.00),
    ('19-260',     'HART Pro Grip Roll (25m)',                  'Hockey', 149.00),
    ('41-325',     'HART HD Mini Carry Bag',                    'Hockey', 13.50),
    ('11-412',     'HART Drum Carry Bag',                       'Hockey', 25.00),
    ('41-183',     'HART Hockey Rack',                          'Hockey', 469.00),

    -- Kits & bulk balls
    ('33-072',     'HART Softee Hockey Set',                    'Hockey', 225.00),
    ('11-410',     'HART Junior Indoor Hockey Set',             'Hockey', 299.00),
    ('11-127',     'HART Mini Indoor Hockey Set',               'Hockey', 189.00),
    ('41-191',     'HART Junior Indoor Hockey Group Kit',       'Hockey', 999.00),
    ('41-263',     'HART Bucket of Rainbow Wiffle Balls (60)',  'Hockey', 115.00),
    ('41-254',     'HART Bucket of Plastic Wiffle Balls (60)',  'Hockey', 129.00)
on conflict (hart_sku) do update
    set name       = excluded.name,
        category   = excluded.category,
        unit_price = excluded.unit_price,
        synced_at  = now();
