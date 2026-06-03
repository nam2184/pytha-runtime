export const CABINET_SAMPLE_CODE = `-- Cabinet sample
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

    pytha.create_group({left, right, bottom, top, back_panel, shelf1, shelf2, left_door, right_door, handle_left, handle_right}, {name = "Sample cabinet"})
end

function main()
    create_cabinet()
    pyui.alert("Created sample cabinet - bottom-left-front at origin")
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

export const MATERIAL_SAMPLE_CODE = `-- Material sample - demonstrates materials and layers
local function create_material_demo()
    local materials = {
        {name = "Oak", color = {0.4, 0.2, 0.1}},
        {name = "Pine", color = {0.7, 0.5, 0.3}},
        {name = "Walnut", color = {0.25, 0.15, 0.05}},
    }

    for i, mat in ipairs(materials) do
        local block = pytha.create_block(100, 100, 50, {(i-1) * 120, 0, 0})
        pytha.set_element_name(block, mat.name)
        pytha.set_element_pen(block, i + 2)
        pytha.set_element_material(block, {name = mat.name, color = mat.color})
        pytha.set_element_layer(block, "Wood Layer " .. i)
    end

    local metal = pytha.create_cylinder(25, 150, {400, 0, 0})
    pytha.set_element_name(metal, "Metal cylinder")
    pytha.set_element_pen(metal, 9)
    pytha.set_element_material(metal, {name = "Steel", color = {0.5, 0.5, 0.55}})
    pytha.set_element_layer(metal, "Metal Layer")
end

function main()
    create_material_demo()
    pyui.alert("Materials and layers demo")
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
  tower: { name: 'Tower', code: TOWER_SAMPLE_CODE },
  spiral: { name: 'Spiral', code: SPIRAL_SAMPLE_CODE },
  shapes: { name: 'Shapes', code: SHAPES_SAMPLE_CODE },
  material: { name: 'Materials', code: MATERIAL_SAMPLE_CODE },
  group: { name: 'Group Demo', code: GROUP_SAMPLE_CODE },
} as const;

export type SampleKey = keyof typeof SAMPLES;