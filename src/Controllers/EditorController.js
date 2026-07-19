const CanvasController = require("./CanvasController");
const Modes = require("./ControlModes");
const CellStates = require("../Organism/Cell/CellStates");
const Directions = require("../Organism/Directions");
const Hyperparams = require("../Hyperparameters");
const Species = require("../Stats/Species");
const LoadController = require("./LoadController");
const FossilRecord = require("../Stats/FossilRecord");

class EditorController extends CanvasController{
    constructor(env, canvas) {
        super(env, canvas);
        this.mode = Modes.None;
        this.edit_cell_type = null;
        this.highlight_org = false;
        this.defineCellTypeSelection();
        this.defineEditorDetails();
        this.defineSaveLoad();
    }

    mouseMove() {
        if (this.right_click || this.left_click)
            this.editOrganism();
    }

    mouseDown() {
        this.editOrganism();
    }

    mouseUp(){}

    getCurLocalCell(){
        return this.env.organism.anatomy.getLocalCell(this.mouse_c-this.env.organism.c, this.mouse_r-this.env.organism.r);
    }

    editOrganism() {
        if (this.mode != Modes.Edit && this.mode != Modes.Paint)
            return;
            
        var loc_cell = this.getCurLocalCell();
        var applyColor = this.mode === Modes.Paint ? $('#use-custom-color').is(':checked') : false;

        if (this.left_click){
            if (this.mode === Modes.Paint) {
                if (loc_cell == null) return; // Cannot paint empty space
                
                var color_val = applyColor ? $('#cell-color-picker').val() : null;
                this.env.paintCell(this.mouse_c, this.mouse_r, color_val);
                return;
            }

            if (this.edit_cell_type == null) {
                // In Edit mode, if no cell type selected, do nothing
                return;
            }
            
            if(this.edit_cell_type == CellStates.eye && loc_cell != null && loc_cell.state == CellStates.eye) {
                loc_cell.direction = Directions.rotateRight(loc_cell.direction);
                this.env.renderFull();
            }
            else {
                this.env.addCellToOrg(this.mouse_c, this.mouse_r, this.edit_cell_type, applyColor);
            }
        }
        else if (this.right_click)
            this.env.removeCellFromOrg(this.mouse_c, this.mouse_r);

        this.setBrainPanelVisibility();
        this.setMoveRangeVisibility();
        this.setHealerPanelVisibility();
        if (this.env.organism.anatomy.has_healer) {
            $('#adjust-healer-cost').text(this.env.organism.healer_food_cost);
        }
        this.setPoisonPanelVisibility();
        if (this.env.organism.anatomy.has_poison) {
            $('#adjust-poison-duration').text(this.env.organism.poison_duration);
        }
        this.updateDetails();
    }

    updateDetails() {
        $('.species-name').text("Species name: "+this.env.organism.species.name);
        $('.cell-count').text("Cell count: "+this.env.organism.anatomy.cells.length);
        if (this.env.organism.isNatural()){
            $('#unnatural-org-warning').css('display', 'none');
        }
        else {
            $('#unnatural-org-warning').css('display', 'block');
        }
    }

    defineCellTypeSelection() {
        var self = this;
        $('.cell-type').click(function() {
            if (self.edit_cell_type === CellStates[this.id]) {
                self.edit_cell_type = null;
                $(".cell-type" ).css( "border-color", "black" );
                return;
            }
            if (CellStates[this.id]) {
                self.edit_cell_type = CellStates[this.id];
            }
            $(".cell-type" ).css( "border-color", "black" );
            var selected = '#'+this.id+'.cell-type';
            $(selected).css("border-color", "yellow");
        });

        $('.color-preset').click(function() {
            var color = $(this).attr('data-color');
            $('#cell-color-picker').val(color);
            
            // Highlight the selected color preset
            $(".color-preset").css("border-color", "#ccc");
            $(".color-preset").css("border-width", "1px");
            $(this).css("border-color", "yellow");
            $(this).css("border-width", "2px");
        });
    }

    defineEditorDetails() {
        this.details_html = $('#organism-details');
        this.edit_details_html = $('#edit-organism-details');

        this.decision_names = ["ignore", "move away", "move towards"];

        $('#species-name-edit').on('focusout', function() {
            const new_name = $('#species-name-edit').val();
            if (new_name === '' || new_name === this.env.organism.species.name)
                return;
            FossilRecord.changeSpeciesName(this.env.organism.species, new_name);
        }.bind(this));

        $('#move-range-edit').change ( function() {
            this.env.organism.move_range = parseInt($('#move-range-edit').val());
        }.bind(this));
		
        $('#mutation-rate-edit').change ( function() {
            this.env.organism.mutability = parseInt($('#mutation-rate-edit').val());
        }.bind(this));
        $('#open-brain-settings').click(function() {
            this.setBrainEditorValues();
            $('#brain-settings-modal').css('display', 'block');
        }.bind(this));

        $('#close-brain-modal').click(function() {
            $('#brain-settings-modal').css('display', 'none');
        }.bind(this));

        this.editing_state_index = 0;
        
        $('#brain-state-tabs-container').on('click', '.state-tab', function(e) {
            this.editing_state_index = parseInt($(e.target).data('index'));
            this.setBrainEditorValues();
        }.bind(this));

        $('#add-brain-state').on('click', function(e) {
            if (this.env.organism.brain.states.length >= 5) {
                alert("Maximum 5 states allowed.");
                return;
            }
            let newState = {
                name: "State " + (this.env.organism.brain.states.length + 1),
                decisions: JSON.parse(JSON.stringify(this.env.organism.brain.states[this.editing_state_index].decisions)),
                actions: JSON.parse(JSON.stringify(this.env.organism.brain.states[this.editing_state_index].actions || {})),
                transitions: []
            };
            this.env.organism.brain.states.push(newState);
            this.editing_state_index = this.env.organism.brain.states.length - 1;
            this.setBrainEditorValues();
        }.bind(this));

        $('#add-brain-transition').on('click', function(e) {
            this.env.organism.brain.states[this.editing_state_index].transitions.push({
                condition_type: "Health",
                operator: "<",
                value: 50,
                target: 0
            });
            this.setBrainEditorValues();
        }.bind(this));

        $('#brain-transitions-list').on('change', '.trans-input', function(e) {
            var idx = parseInt($(e.target).data('idx'));
            var field = $(e.target).data('field');
            var val = $(e.target).val();
            if (field === 'target') val = parseInt(val);
            this.env.organism.brain.states[this.editing_state_index].transitions[idx][field] = val;
        }.bind(this));

        $('#brain-transitions-list').on('click', '.remove-trans', function(e) {
            var idx = parseInt($(e.target).data('idx'));
            this.env.organism.brain.states[this.editing_state_index].transitions.splice(idx, 1);
            this.setBrainEditorValues();
        }.bind(this));

        $('#brain-settings-list').on('change', '.reaction-select', function(e) {
            var obs = $(e.target).data('obs');
            var decision = parseInt($(e.target).val());
            this.env.organism.brain.states[this.editing_state_index].decisions[obs] = decision;
            this.setBrainDetails();
        }.bind(this));

        $('#brain-settings-list').on('change', '.action-select', function(e) {
            var obs = $(e.target).data('obs');
            var action = $(e.target).val();
            if (!this.env.organism.brain.states[this.editing_state_index].actions) {
                this.env.organism.brain.states[this.editing_state_index].actions = {};
            }
            if (action === "none") {
                delete this.env.organism.brain.states[this.editing_state_index].actions[obs];
            } else {
                this.env.organism.brain.states[this.editing_state_index].actions[obs] = action;
            }
            this.setBrainDetails();
        }.bind(this));
        $('#adjust-healer-cost').on('click', function(e) {
            this.env.organism.healer_food_cost++;
            $('#adjust-healer-cost').text(this.env.organism.healer_food_cost);
            e.preventDefault();
        }.bind(this));
        $('#adjust-healer-cost').on('contextmenu', function(e) {
            if (this.env.organism.healer_food_cost > 0) {
                this.env.organism.healer_food_cost--;
            }
            $('#adjust-healer-cost').text(this.env.organism.healer_food_cost);
            e.preventDefault();
        }.bind(this));

        $('#adjust-poison-duration').on('click', function(e) {
            this.env.organism.poison_duration++;
            $('#adjust-poison-duration').text(this.env.organism.poison_duration);
            e.preventDefault();
        }.bind(this));
        $('#adjust-poison-duration').on('contextmenu', function(e) {
            if (this.env.organism.poison_duration > 0) {
                this.env.organism.poison_duration--;
            }
            $('#adjust-poison-duration').text(this.env.organism.poison_duration);
            e.preventDefault();
        }.bind(this));
    }

    defineSaveLoad() {
        $('#save-org').click(()=>{
            let org = this.env.organism.serialize();
            let data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(org));
            let downloadEl = document.getElementById('download-el');
            downloadEl.setAttribute("href", data);
            const name = this.env.organism.species.name ? this.env.organism.species.name : "organism";
            downloadEl.setAttribute("download", name+".json");
            downloadEl.click();
        });
        $('#load-org').click(() => {
            LoadController.loadJson((org)=>{
                this.loadOrg(org);
            });
        });
        $('#fullscreen-editor').click(() => {
            this.env.toggleFullscreen();
        });
    }

    loadOrg(org) {
        this.env.clear();
        this.env.organism.loadRaw(org);
        var center = this.env.grid_map.getCenter();
        this.env.organism.c = center[0];
        this.env.organism.r = center[1];
        this.refreshDetailsPanel();
        this.env.organism.updateGrid();
        this.env.renderFull();
        this.env.organism.species = new Species(this.env.organism.anatomy, null, 0);
        if (org.species_name)
            this.env.organism.species.name = org.species_name;
        $('#edit-organism-details').css('display', 'none');
        if (this.mode === Modes.Clone)
            $('#drop-org').click();
    }

    clearDetailsPanel() {
        $('#organism-details').css('display', 'none');
        $('#edit-organism-details').css('display', 'none');
        $('#randomize-organism-details').css('display', 'none');
    }

    refreshDetailsPanel() {
        if (this.mode === Modes.Edit || this.mode === Modes.Paint)
            this.setEditorPanel();
        else
            this.setDetailsPanel();

    }

    setDetailsPanel() {
        this.clearDetailsPanel();
        var org = this.env.organism;
        
        this.updateDetails();
        $('#move-range').text("Move Range: "+org.move_range);
        $('#mutation-rate').text("Mutation Rate: "+org.mutability);
       
		if (Hyperparams.useGlobalMutability) {
            $('#mutation-rate').css('display', 'none');
        }
        else {
            $('#mutation-rate').css('display', 'block');
        }

        this.setMoveRangeVisibility();

        if (this.setBrainPanelVisibility()) {
            this.setBrainDetails();
        }

        if (this.setHealerPanelVisibility()) {
            $('#healer-cost-view').text("Healer Food Cost: " + org.healer_food_cost);
        }
        if (this.setPoisonPanelVisibility()) {
            $('#poison-duration-view').text("Poison Duration: " + org.poison_duration);
        }
        $('#organism-details').css('display', 'block');
    }

    setEditorPanel() {
        this.clearDetailsPanel();
        var org = this.env.organism;

        $('#species-name-edit').val(org.species.name);
        $('.cell-count').text("Cell count: "+org.anatomy.cells.length);
        if (this.setMoveRangeVisibility()){
            $('#move-range-edit').val(org.move_range);
        }

		$('#mutation-rate-edit').val(org.mutability);
        if (Hyperparams.useGlobalMutability) {
			$('#mutation-rate-cont').css('display', 'none');
        }
        else {
            $('#mutation-rate-cont').css('display', 'block');
        }
        
        if (this.setBrainPanelVisibility()){
            this.setBrainEditorValues();
        }

        if (this.setHealerPanelVisibility()) {
            $('#adjust-healer-cost').text(org.healer_food_cost);
        }
        if (this.setPoisonPanelVisibility()) {
            $('#adjust-poison-duration').text(org.poison_duration);
        }

        if (this.mode === Modes.Paint) {
            $('#cell-selections').css('display', 'none');
            $('#color-selections').css('display', 'block');
        } else {
            $('#cell-selections').css('display', 'grid');
            $('#color-selections').css('display', 'none');
        }
        $('#edit-organism-details').css('display', 'block');
    }

    setBrainPanelVisibility() {
        $('.brain-details').css('display', 'block');
        return true;
    }

    setBrainDetails() {
        var chase_types = [];
        var retreat_types = [];
        if (!this.env.organism.brain.states || this.env.organism.brain.states.length === 0) return;
        var state = this.env.organism.brain.states[0]; 
        for(var cell_name in state.decisions) {
            var decision = state.decisions[cell_name];
            if (decision < 0) {
                retreat_types.push(`${cell_name}(${decision})`);
            }
            else if (decision > 0) {
                chase_types.push(`${cell_name}(+${decision})`);
            }
        }
        $('.chase-types').text("Move Towards (State 1): " + (chase_types.length ? chase_types.join(', ') : 'None'));
        $('.retreat-types').text("Move Away From (State 1): " + (retreat_types.length ? retreat_types.join(', ') : 'None'));
    }

    setMoveRangeVisibility() {
        var org = this.env.organism;
        if (org.anatomy.is_mover) {
            $('#move-range-cont').css('display', 'block');
            $('#move-range').css('display', 'block');
            return true;
        }
        $('#move-range-cont').css('display', 'none');
        $('#move-range').css('display', 'none');
        return false;
    }

    setHealerPanelVisibility() {
        var org = this.env.organism;
        if (org.anatomy.has_healer) {
            $('.healer-details').css('display', 'block');
            return true;
        }
        $('.healer-details').css('display', 'none');
        return false;
    }

    setPoisonPanelVisibility() {
        var org = this.env.organism;
        if (org.anatomy.has_poison) {
            $('.poison-details').css('display', 'block');
            return true;
        }
        $('.poison-details').css('display', 'none');
        return false;
    }

    setBrainEditorValues() {
        const brain = this.env.organism.brain;
        if (!brain.states[this.editing_state_index]) this.editing_state_index = 0;
        
        // Render dynamic tabs
        const tabsContainer = $('#brain-state-tabs-container');
        tabsContainer.empty();
        for (let i = 0; i < brain.states.length; i++) {
            let tab = $('<button class="state-tab" data-index="'+i+'" style="flex: 1; min-width: 100px; padding: 10px; border-radius: 8px 8px 0 0; margin: 0;"></button>');
            tab.text("State " + (i+1));
            tab.css('background-color', i === this.editing_state_index ? 'var(--tab-active)' : 'var(--tab)');
            tabsContainer.append(tab);
        }

        const active_state = brain.states[this.editing_state_index];

        // Render transitions
        const transContainer = $('#brain-transitions-list');
        transContainer.empty();
        if (active_state.transitions.length === 0) {
            transContainer.append('<div style="color: #666; font-style: italic;">No transitions. Will stay in this state forever.</div>');
        } else {
            for (let i = 0; i < active_state.transitions.length; i++) {
                let t = active_state.transitions[i];
                let row = $('<div style="display: flex; align-items: center; margin-bottom: 5px;"></div>');
                
                row.append('<span>IF </span>');
                
                let condSelect = $('<select class="trans-input" data-idx="'+i+'" data-field="condition_type" style="margin: 0 5px;"><option value="Health">Health</option><option value="Food">Food</option><option value="Always">Always</option></select>');
                condSelect.val(t.condition_type);
                row.append(condSelect);

                let opSelect = $('<select class="trans-input" data-idx="'+i+'" data-field="operator" style="margin: 0 5px;"><option value="<">&lt;</option><option value=">">&gt;</option><option value="=">=</option></select>');
                opSelect.val(t.operator);
                row.append(opSelect);

                let valInput = $('<input type="number" class="trans-input" data-idx="'+i+'" data-field="value" style="width: 60px; margin: 0 5px;">');
                valInput.val(t.value);
                row.append(valInput);
                row.append('<span> % </span>');

                row.append('<span style="margin: 0 5px;"> GOTO </span>');

                let targetSelect = $('<select class="trans-input" data-idx="'+i+'" data-field="target" style="margin: 0 5px;"></select>');
                for (let j = 0; j < brain.states.length; j++) {
                    targetSelect.append('<option value="'+j+'">State '+(j+1)+'</option>');
                }
                targetSelect.val(t.target);
                row.append(targetSelect);

                let removeBtn = $('<button class="remove-trans" data-idx="'+i+'" style="margin-left: 10px; padding: 2px 5px; color: red;">X</button>');
                row.append(removeBtn);

                transContainer.append(row);
            }
        }

        // Render priorities
        const container = $('#brain-settings-list');
        container.empty();

        for (let obs in active_state.decisions) {
            const reaction = active_state.decisions[obs];
            const action = (active_state.actions && active_state.actions[obs]) ? active_state.actions[obs] : "none";
            const row = $('<div class="brain-settings-row" style="display:flex; align-items:center;"></div>');
            row.append($('<label style="width: 25%;"></label>').text(obs));
            
            const select = $('<select class="reaction-select" data-obs="'+obs+'" style="flex-grow: 1; margin: 0 5px; padding: 5px;"></select>');
            select.append('<option value="-10">Flee in terror (-10)</option>');
            select.append('<option value="-8">Run away quickly (-8)</option>');
            select.append('<option value="-5">Actively avoid (-5)</option>');
            select.append('<option value="-2">Casually avoid (-2)</option>');
            select.append('<option value="0">Ignore (0)</option>');
            select.append('<option value="2">Casually approach (2)</option>');
            select.append('<option value="5">Actively chase (5)</option>');
            select.append('<option value="8">Chase aggressively (8)</option>');
            select.append('<option value="10">Obsessively chase (10)</option>');
            
            // If the current reaction isn't perfectly matched, pick the closest one, or just add it
            if (select.find(`option[value="${reaction}"]`).length === 0) {
                select.append(`<option value="${reaction}">Custom (${reaction})</option>`);
            }
            select.val(reaction);
            row.append(select);

            // Add action select
            const action_select = $('<select class="action-select" data-obs="'+obs+'" style="width: 100px; margin: 0 5px; padding: 5px;"></select>');
            action_select.append('<option value="none">No Action</option>');
            if (this.env.organism.anatomy.has_explosive) {
                action_select.append('<option value="explode">Explode</option>');
            }
            if (this.env.organism.anatomy.has_healer) {
                action_select.append('<option value="heal">Heal</option>');
            }
            action_select.append('<option value="hibernate">Hibernate</option>');
            action_select.append('<option value="build">Build Wall</option>');
            if (this.env.organism.anatomy.has_shooter) {
                action_select.append('<option value="shoot">Shoot</option>');
            }
            action_select.val(action);
            row.append(action_select);

            container.append(row);
        }
    }

    setRandomizePanel() {
        this.clearDetailsPanel();
        $('#randomize-organism-details').css('display', 'block');
    }
}

module.exports = EditorController;
