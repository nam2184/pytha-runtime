export const CABINET_SAMPLE_CODE = `-- Standard Cabinet
local function create_cabinet()
    local width = 600
    local depth = 400
    local height = 800
    local panel = 18
    local back = 8

    local left = pytha.create_block(panel, depth, height, {0, 0, 0})
    pytha.set_element_name(left, "Left side")
    pytha.set_element_pen(left, 3)

    local right = pytha.create_block(panel, depth, height, {width - panel, 0, 0})
    pytha.set_element_name(right, "Right side")
    pytha.set_element_pen(right, 3)

    local bottom = pytha.create_block(width, depth, panel, {0, 0, 0})
    pytha.set_element_name(bottom, "Bottom")
    pytha.set_element_pen(bottom, 4)

    local top = pytha.create_block(width, depth, panel, {0, 0, height - panel})
    pytha.set_element_name(top, "Top")
    pytha.set_element_pen(top, 4)

    local back_panel = pytha.create_block(width, back, height, {0, depth - back, 0})
    pytha.set_element_name(back_panel, "Back panel")
    pytha.set_element_pen(back_panel, 8)

    local shelf1 = pytha.create_block(width - panel * 2, depth - back, panel, {panel, 0, height * 0.35 - panel / 2})
    pytha.set_element_name(shelf1, "Lower shelf")
    pytha.set_element_pen(shelf1, 5)

    local shelf2 = pytha.create_block(width - panel * 2, depth - back, panel, {panel, 0, height * 0.65 - panel / 2})
    pytha.set_element_name(shelf2, "Upper shelf")
    pytha.set_element_pen(shelf2, 5)

    local left_door = pytha.create_block((width / 2) - 4, panel, height - panel * 2, {0, -panel, panel})
    pytha.set_element_name(left_door, "Left door")
    pytha.set_element_pen(left_door, 6)

    local right_door = pytha.create_block((width / 2) - 4, panel, height - panel * 2, {(width / 2) + 4, -panel, panel})
    pytha.set_element_name(right_door, "Right door")
    pytha.set_element_pen(right_door, 6)

    local handle_left = pytha.create_block(12, 12, 120, {(width / 2) - 40, -panel - 12, height / 2})
    pytha.set_element_name(handle_left, "Left handle")
    pytha.set_element_pen(handle_left, 2)

    local handle_right = pytha.create_block(12, 12, 120, {(width / 2) + 28, -panel - 12, height / 2})
    pytha.set_element_name(handle_right, "Right handle")
    pytha.set_element_pen(handle_right, 2)

    pytha.create_group({left, right, bottom, top, back_panel, shelf1, shelf2, left_door, right_door, handle_left, handle_right}, {name = "Standard Cabinet"})
end

function main()
    create_cabinet()
    pyui.alert("Created standard cabinet - bottom-left-front at origin")
end`;

export const TALL_CABINET_SAMPLE_CODE = `-- Tall Pantry Cabinet
local function create_tall_cabinet()
    local width = 400
    local depth = 350
    local height = 2000
    local panel = 18
    local back = 8

    local left = pytha.create_block(panel, depth, height, {0, 0, 0})
    pytha.set_element_name(left, "Left side")
    pytha.set_element_pen(left, 3)

    local right = pytha.create_block(panel, depth, height, {width - panel, 0, 0})
    pytha.set_element_name(right, "Right side")
    pytha.set_element_pen(right, 3)

    local bottom = pytha.create_block(width, depth, panel, {0, 0, 0})
    pytha.set_element_name(bottom, "Bottom")
    pytha.set_element_pen(bottom, 4)

    local top = pytha.create_block(width, depth, panel, {0, 0, height - panel})
    pytha.set_element_name(top, "Top")
    pytha.set_element_pen(top, 4)

    local back_panel = pytha.create_block(width, back, height, {0, depth - back, 0})
    pytha.set_element_name(back_panel, "Back panel")
    pytha.set_element_pen(back_panel, 8)

    local num_shelves = 5
    for i = 1, num_shelves do
        local shelf_y = (height / (num_shelves + 1)) * i
        local shelf = pytha.create_block(width - panel * 2, depth - back, panel, {panel, 0, shelf_y - panel / 2})
        pytha.set_element_name(shelf, "Shelf " .. i)
        pytha.set_element_pen(shelf, 5)
    end

    local upper_door = pytha.create_block(width - 4, panel, height * 0.4 - panel, {2, -panel, height * 0.6 + panel / 2})
    pytha.set_element_name(upper_door, "Upper door")
    pytha.set_element_pen(upper_door, 6)

    local lower_door = pytha.create_block(width - 4, panel, height * 0.4 - panel, {2, -panel, panel})
    pytha.set_element_name(lower_door, "Lower door")
    pytha.set_element_pen(lower_door, 6)

    local handle1 = pytha.create_block(8, 8, 100, {width / 2 - 30, -panel - 8, height * 0.8})
    pytha.set_element_name(handle1, "Upper handle")
    pytha.set_element_pen(handle1, 2)

    local handle2 = pytha.create_block(8, 8, 100, {width / 2 - 30, -panel - 8, height * 0.2})
    pytha.set_element_name(handle2, "Lower handle")
    pytha.set_element_pen(handle2, 2)

    pytha.create_group({left, right, bottom, top, back_panel, upper_door, lower_door, handle1, handle2}, {name = "Tall Cabinet"})
end

function main()
    create_tall_cabinet()
    pyui.alert("Created tall pantry cabinet")
end`;

export const WALL_CABINET_SAMPLE_CODE = `-- Wall Cabinet
local function create_wall_cabinet()
    local width = 800
    local depth = 300
    local height = 400
    local panel = 18
    local mount_height = 1400

    local left = pytha.create_block(panel, depth, height, {0, 0, mount_height})
    pytha.set_element_name(left, "Left side")
    pytha.set_element_pen(left, 3)

    local right = pytha.create_block(panel, depth, height, {width - panel, 0, mount_height})
    pytha.set_element_name(right, "Right side")
    pytha.set_element_pen(right, 3)

    local bottom = pytha.create_block(width, depth, panel, {0, 0, mount_height})
    pytha.set_element_name(bottom, "Bottom")
    pytha.set_element_pen(bottom, 4)

    local top = pytha.create_block(width, depth, panel, {0, 0, mount_height + height - panel})
    pytha.set_element_name(top, "Top")
    pytha.set_element_pen(top, 4)

    local back_panel = pytha.create_block(width, 6, height, {0, depth - 6, mount_height})
    pytha.set_element_name(back_panel, "Back panel")
    pytha.set_element_pen(back_panel, 8)

    local shelf1 = pytha.create_block(width - panel * 2, depth - 6, panel, {panel, 0, mount_height + height * 0.33 - panel / 2})
    pytha.set_element_name(shelf1, "Shelf 1")
    pytha.set_element_pen(shelf1, 5)

    local shelf2 = pytha.create_block(width - panel * 2, depth - 6, panel, {panel, 0, mount_height + height * 0.66 - panel / 2})
    pytha.set_element_name(shelf2, "Shelf 2")
    pytha.set_element_pen(shelf2, 5)

    local door = pytha.create_block(width - 4, panel, height - 4, {2, -panel, mount_height + 2})
    pytha.set_element_name(door, "Door")
    pytha.set_element_pen(door, 6)

    local handle = pytha.create_block(8, 8, 80, {width / 2, -panel - 8, mount_height + height / 2})
    pytha.set_element_name(handle, "Handle")
    pytha.set_element_pen(handle, 2)

    pytha.create_group({left, right, bottom, top, back_panel, shelf1, shelf2, door, handle}, {name = "Wall Cabinet"})
end

function main()
    create_wall_cabinet()
    pyui.alert("Created wall cabinet - mounted at height 1400")
end`;

export const BASE_CABINET_SAMPLE_CODE = `-- Base Kitchen Cabinet with Drawers
local function create_base_cabinet()
    local width = 800
    local depth = 600
    local height = 870
    local panel = 18
    local back = 8

    local left = pytha.create_block(panel, depth, height, {0, 0, 0})
    pytha.set_element_name(left, "Left side")
    pytha.set_element_pen(left, 3)

    local right = pytha.create_block(panel, depth, height, {width - panel, 0, 0})
    pytha.set_element_name(right, "Right side")
    pytha.set_element_pen(right, 3)

    local bottom = pytha.create_block(width, depth, panel, {0, 0, 0})
    pytha.set_element_name(bottom, "Bottom")
    pytha.set_element_pen(bottom, 4)

    local back_panel = pytha.create_block(width, back, height, {0, depth - back, 0})
    pytha.set_element_name(back_panel, "Back panel")
    pytha.set_element_pen(back_panel, 8)

    local drawer_height = (height - panel * 3) / 3
    for i = 1, 3 do
        local drawer_y = panel + (i - 1) * drawer_height
        local drawer = pytha.create_block(width - panel * 2 - 4, depth - back - 4, drawer_height - 4, {panel + 2, 2, drawer_y})
        pytha.set_element_name(drawer, "Drawer " .. i)
        pytha.set_element_pen(drawer, 5)

        local handle = pytha.create_block(200, 12, 20, {width / 2, -panel - 12, drawer_y + drawer_height / 2})
        pytha.set_element_name(handle, "Drawer " .. i .. " handle")
        pytha.set_element_pen(handle, 2)
    end

    local kick_plate = pytha.create_block(width - panel * 2, 50, 80, {panel, 0, -40})
    pytha.set_element_name(kick_plate, "Kick plate")
    pytha.set_element_pen(kick_plate, 1)

    pytha.create_group({left, right, bottom, back_panel, kick_plate}, {name = "Base Cabinet"})
end

function main()
    create_base_cabinet()
    pyui.alert("Created base cabinet with 3 drawers")
end`;

export const TOWER_SAMPLE_CODE = `-- Tower sample - demonstrates rotation and multiple elements
local function create_tower()
    local base_size = 200
    local height = 50
    local levels = 6

    for i = 1, levels do
        local y_pos = (i - 1) * height
        local size = base_size - (i - 1) * 20

        local block = pytha.create_block(size, size, height, {0, 0, y_pos})
        pytha.set_element_name(block, "Level " .. i)
        pytha.set_element_pen(block, (i % 7) + 1)
    end

    local spire = pytha.create_cylinder(80, 150, {0, 0, levels * height})
    pytha.set_element_name(spire, "Spire")
    pytha.set_element_pen(spire, 8)
end

function main()
    create_tower()
    pyui.alert("Tower created with rotation transform")
end`;

export const SPIRAL_SAMPLE_CODE = `-- Spiral sample - demonstrates copy_element and transforms
local function create_spiral()
    local steps = 12
    local radius = 100
    local height_step = 40

    local prev = pytha.create_cylinder(15, 200, {radius, 0, 0})
    pytha.set_element_name(prev, "Step 1")
    pytha.set_element_pen(prev, 3)

    for i = 2, steps do
        local angle = (i - 1) * (math.pi / 5)
        local x = math.cos(angle) * radius
        local z = math.sin(angle) * radius
        local y = (i - 1) * height_step

        local copied = pytha.copy_element({prev}, {x - radius, y, z - radius}, 1)[1]
        pytha.set_element_name(copied, "Step " .. i)
        pytha.set_element_pen(copied, (i % 7) + 1)
        prev = copied
    end
end

function main()
    create_spiral()
    pyui.alert("Spiral created with copy_element")
end`;

export const SHAPES_SAMPLE_CODE = `-- Shapes sample - demonstrates all basic shapes
local function create_shapes()
    local shapes = {
        {type = "block", name = "Block A", pen = 3, size = {80, 60, 40}, pos = {0, 0, 0}},
        {type = "block", name = "Block B", pen = 4, size = {60, 80, 40}, pos = {100, 0, 0}},
        {type = "cylinder", name = "Cylinder A", pen = 5, radius = 30, height = 100, pos = {200, 0, 0}},
        {type = "sphere", name = "Sphere A", pen = 6, radius = 40, pos = {300, 0, 0}},
    }

    for _, s in ipairs(shapes) do
        local elem
        if s.type == "block" then
            elem = pytha.create_block(s.size[1], s.size[2], s.size[3], {s.pos[1], s.pos[2], s.pos[3]})
        elseif s.type == "cylinder" then
            elem = pytha.create_cylinder(s.height, s.radius, {s.pos[1], s.pos[2], s.pos[3]})
        elseif s.type == "sphere" then
            elem = pytha.create_sphere(s.radius, {s.pos[1], s.pos[2], s.pos[3]})
        end
        pytha.set_element_name(elem, s.name)
        pytha.set_element_pen(elem, s.pen)
    end

    local poly = pytha.create_polygon({{0, 0}, {100, 0}, {100, 80}, {50, 120}, {0, 80}}, {400, 0, 0})
    pytha.set_element_name(poly, "Polygon")
    pytha.set_element_pen(poly, 7)
end

function main()
    create_shapes()
    pyui.alert("Various shapes created")
end`;

export const GROUP_SAMPLE_CODE = `-- Group sample - demonstrates grouping and descendants
local function create_group_demo()
    local leg1 = pytha.create_block(30, 30, 200, {0, 0, 0})
    local leg2 = pytha.create_block(30, 30, 200, {270, 0, 0})
    local leg3 = pytha.create_block(30, 30, 200, {0, 270, 0})
    local leg4 = pytha.create_block(30, 30, 200, {270, 270, 0})

    local top = pytha.create_block(300, 300, 20, {0, 0, 200})
    pytha.set_element_pen(leg1, 3)
    pytha.set_element_pen(leg2, 3)
    pytha.set_element_pen(leg3, 3)
    pytha.set_element_pen(leg4, 3)
    pytha.set_element_pen(top, 4)

    pytha.set_element_name(leg1, "Leg 1")
    pytha.set_element_name(leg2, "Leg 2")
    pytha.set_element_name(leg3, "Leg 3")
    pytha.set_element_name(leg4, "Leg 4")
    pytha.set_element_name(top, "Table top")

    local table = pytha.create_group({leg1, leg2, leg3, leg4, top}, {name = "Coffee Table"})
    pytha.set_element_history(table, {plugin = "demo", revision = 1}, "creation")

    local mirror = pytha.mirror_element({table}, {500, 500, 0}, {0, 1, 0})[1]
    pytha.set_element_name(mirror, "Mirrored Table")

    local rotated = pytha.rotate_element({table}, {0, 0, 0}, {0, 0, 1}, 45)[1]
    pytha.set_element_name(rotated, "Rotated Table")
end

function main()
    create_group_demo()
    pyui.alert("Group demo - grouping, mirror, rotate")
end`;

export const SAMPLES = {
  cabinet: { name: 'Cabinet', code: CABINET_SAMPLE_CODE },
  tall_cabinet: { name: 'Tall Cabinet', code: TALL_CABINET_SAMPLE_CODE },
  wall_cabinet: { name: 'Wall Cabinet', code: WALL_CABINET_SAMPLE_CODE },
  base_cabinet: { name: 'Base Cabinet', code: BASE_CABINET_SAMPLE_CODE },
  tower: { name: 'Tower', code: TOWER_SAMPLE_CODE },
  spiral: { name: 'Spiral', code: SPIRAL_SAMPLE_CODE },
  shapes: { name: 'Shapes', code: SHAPES_SAMPLE_CODE },
  group: { name: 'Group Demo', code: GROUP_SAMPLE_CODE },
} as const;

export type SampleKey = keyof typeof SAMPLES;