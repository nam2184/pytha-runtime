export const CABINET_SAMPLE_CODE = `-- Cabinet sample
function main()
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
    pyui.alert("Created sample cabinet - bottom-left-front at origin")
end`;
