import type { SharedBatterySummary, IdentifiedSubComponent } from '../types/api'

export type PathwayGuidanceStatus =
  | 'Potentially reusable pending assessment'
  | 'Suitable for a specified application following assessment'
  | 'Repair or refurbishment may be required'
  | 'Recycling or material recovery recommended'
  | 'Insufficient information to determine a suitable pathway'

export function getPathwayStatusBadge(status: string) {
  switch (status) {
    case 'Potentially reusable pending assessment':
      return {
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        dotClass: 'bg-emerald-500',
        label: 'Potentially Reusable Pending Assessment',
      }
    case 'Suitable for a specified application following assessment':
      return {
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-300',
        dotClass: 'bg-sky-500',
        label: 'Suitable for Specified Application',
      }
    case 'Repair or refurbishment may be required':
      return {
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
        dotClass: 'bg-amber-500',
        label: 'Repair or Refurbishment Required',
      }
    case 'Recycling or material recovery recommended':
      return {
        badgeClass: 'bg-purple-50 text-purple-800 border-purple-300',
        dotClass: 'bg-purple-500',
        label: 'Recycling / Material Recovery Recommended',
      }
    case 'Insufficient information to determine a suitable pathway':
    default:
      return {
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
        dotClass: 'bg-slate-400',
        label: 'Insufficient Information to Determine Pathway',
      }
  }
}

// Fallback helper in case backend components are not populated
export function buildDefaultComponents(bat: SharedBatterySummary, dispRep?: any): IdentifiedSubComponent[] {
  const chem = bat.chemistry || 'LFP'
  const voltage = bat.voltage_v || 350.0
  const cap = bat.rated_capacity_kwh || 40.0
  const isDamaged =
    ['Damaged', 'CRITICAL'].includes(bat.reported_condition) ||
    Boolean(dispRep && ['DAMAGED', 'HAZARDOUS'].includes(dispRep.current_condition))

  return [
    {
      id: 'cells',
      name: 'Battery Cells & Sub-modules',
      component_type: 'Electrochemical Storage',
      pack_function: 'The foundational electrochemical storage unit converting chemical energy into electrical flow.',
      specifications: {
        chemistry: `${chem} (${chem === 'LFP' ? 'Lithium Iron Phosphate' : 'Nickel Manganese Cobalt'})`,
        nominal_pack_voltage: `${voltage.toFixed(1)} V DC`,
        rated_nominal_capacity: `${cap.toFixed(1)} kWh`,
        cell_format: chem === 'LFP' ? 'Prismatic / Blade Modular Strings' : 'Pouch / Prismatic Groupings',
      },
      recorded_condition: isDamaged ? 'Physically damaged / compromised' : 'Visually intact; awaiting bench evaluation',
      known_faults: isDamaged ? 'Pack deformation reported' : 'No physical damage documented',
      potential_applications: [
        'Stationary Energy Storage Systems (BESS)',
        'Solar Energy Storage Systems (5–15 kWh)',
        'Telecom Tower & UPS Backup Power',
        'Hydrometallurgical Critical Mineral Extraction',
      ],
      testing_required: [
        'Electrochemical Impedance Spectroscopy (EIS)',
        'Module-level capacity retention grading (C/3 test)',
        'Open-circuit voltage (OCV) retention test over 72h',
      ],
      suggested_pathway: isDamaged ? 'Recycling or material recovery recommended' : 'Potentially reusable pending assessment',
      pathway_reason: isDamaged
        ? 'Physical deformation prevents high-voltage energization; direct recycling is safest.'
        : 'Cells retain physical integrity and require bench grading before stationary second-life integration.',
    },
    {
      id: 'modules',
      name: 'Battery Module Assemblies & Interconnects',
      component_type: 'Mechanical & Structural Sub-pack',
      pack_function: 'Groups individual cells into mechanically rigid, serviceable modules with integrated voltage taps.',
      specifications: {
        architecture: 'Laser-welded terminal busbars with spring tie rods',
        subpack_voltage: '24V to 48V DC per modular block',
      },
      recorded_condition: isDamaged ? 'Module deformation reported' : 'Intact modular casing; awaiting disassembly check',
      known_faults: isDamaged ? 'Impact deformation documented' : 'No module defects documented',
      potential_applications: [
        'Reconfigured 48V Telecom & Microgrid Banks',
        'EV Replacement Module Spare Parts',
        'Modular Solar Backup Units',
      ],
      testing_required: [
        'Module internal resistance balance check',
        'Ultrasonic weld inspection on inter-cell tab bonds',
      ],
      suggested_pathway: isDamaged ? 'Recycling or material recovery recommended' : 'Potentially reusable pending assessment',
      pathway_reason: 'Intact sub-modules can be decoupled and wired in parallel/series for 48V stationary applications.',
    },
    {
      id: 'bms',
      name: 'Battery Management System (BMS Controller)',
      component_type: 'Electronic Controller & Telemetry',
      pack_function: 'Monitors cell voltages, current, temperatures, and opens safety contactors upon fault condition.',
      specifications: {
        controller_type: 'Automotive Master Controller with Slave Monitoring Boards',
        communication: 'Automotive CANbus 2.0B / CAN-FD',
      },
      recorded_condition: 'OEM hardware installed; telemetry logged',
      known_faults: 'Firmware immobilizer lockout (requires CAN gateway for stationary use)',
      potential_applications: [
        'Compatible EV Replacement Spare Parts',
        'Stationary Storage with CAN Gateway',
        'WEEE Precious Metal Scrap Recovery',
      ],
      testing_required: [
        'CANbus communication handshake & DTC diagnostic scan',
        'AFE voltage sensing ADC calibration verification',
      ],
      suggested_pathway: 'Repair or refurbishment may be required',
      pathway_reason: 'Automotive BMS units require firmware reconfiguration or an external translation gateway.',
    },
    {
      id: 'cooling',
      name: 'Liquid Cooling & Thermal Plates',
      component_type: 'Thermal Management Sub-system',
      pack_function: 'Regulates cell operating temperature to prevent localized thermal hot spots.',
      specifications: {
        construction: 'Roll-bonded aluminum cooling channels with fluid manifolds',
        pressure_rating: 'Rated to 2.5 bar operational pressure',
      },
      recorded_condition: 'Coolant evacuated; aluminum plates structurally intact',
      known_faults: 'None documented',
      potential_applications: [
        'Stationary BESS Thermal Management Loops',
        'Industrial Liquid Heat Exchangers',
        'Closed-Loop Wrought Aluminum Remelting',
      ],
      testing_required: [
        'Pneumatic pressure decay leak test at 2.0 bar',
        'Channel flow rate flush verification',
      ],
      suggested_pathway: 'Suitable for a specified application following assessment',
      pathway_reason: 'Clean cooling plates without blockages can be integrated into stationary cooling loops.',
    },
    {
      id: 'busbars',
      name: 'High-Voltage Busbars & Electrical Connections',
      component_type: 'High-Current Electrical Distribution',
      pack_function: 'Carries high currents (up to 400A) between cell modules, contactors, and external terminals.',
      specifications: {
        material: 'C11000 Electrolytic Tough Pitch Pure Copper (99.9% Cu)',
        plating: 'Tin/Nickel electroplated anti-oxidation coating',
      },
      recorded_condition: 'Mechanically intact; contact surfaces sound',
      known_faults: 'None documented',
      potential_applications: [
        'Reconfigured Buswork for Stationary Battery Banks',
        'Industrial Switchgear & DC Power Distribution',
        'Direct Smelting for 99.9% Pure Cathode Copper',
      ],
      testing_required: [
        'Micro-ohmmeter contact resistance measurement (< 50 µΩ)',
        'Dielectric breakdown test on flame-retardant polyamide (> 1500V DC)',
      ],
      suggested_pathway: 'Suitable for a specified application following assessment',
      pathway_reason: 'High-purity copper busbars are robust and easily repurposed or remelted with near-zero loss.',
    },
    {
      id: 'enclosure',
      name: 'Structural Battery Enclosure & Housing',
      component_type: 'Structural Protection & IP67 Enclosure',
      pack_function: 'Shields cells from debris and collision loads, maintaining hermetic seal.',
      specifications: {
        tray_material: 'Extruded 6000-series structural aluminum alloy tray with steel service lid',
        environmental_rating: 'IP67 / IP69K ingress protection with EPDM gasket',
      },
      recorded_condition: isDamaged ? 'Underbody casing deformation reported' : 'Housing structurally intact; seals in place',
      known_faults: isDamaged ? 'Impact deformation documented' : 'No external puncture or seal failure documented',
      potential_applications: [
        'Weatherproof Outdoor Enclosure for Stationary Solar Battery Banks',
        'Industrial Protective Storage Housing',
        'Secondary Aluminum & Steel Remelting',
      ],
      testing_required: [
        'Vacuum decay hermetic seal test',
        'Weld seam dye penetrant inspection',
      ],
      suggested_pathway: isDamaged ? 'Recycling or material recovery recommended' : 'Suitable for a specified application following assessment',
      pathway_reason: isDamaged
        ? 'Deformed structural housing cannot guarantee IP containment; remelting recovers high-grade aluminum.'
        : 'Intact automotive casings offer superior environmental protection for outdoor ground-mounted systems.',
    },
    {
      id: 'contactors',
      name: 'High-Voltage Contactors & Safety Pyrofuse',
      component_type: 'Safety Isolation & Circuit Protection',
      pack_function: 'Electromechanically isolates high-voltage terminals when system is off; severs circuit under 1ms on fault.',
      specifications: {
        relay_type: 'Dual hermetically sealed ceramic arc-chamber contactors (450V / 500A)',
        safety_disconnect: 'High-speed pyrotechnic circuit breaker + manual disconnect',
      },
      recorded_condition: 'Relays present; pyrofuse un-triggered',
      known_faults: 'None documented',
      potential_applications: [
        'DC Safety Disconnect in Stationary Storage Systems',
        'Replacement Parts for Vehicle Maintenance',
        'Precious Metals Recycling (Silver contact recovery)',
      ],
      testing_required: [
        'Coil pick-up and drop-out voltage verification',
        'Contact resistance under load (< 1 mΩ)',
      ],
      suggested_pathway: 'Suitable for a specified application following assessment',
      pathway_reason: 'Certified hermetic automotive contactors provide critical automatic disconnect protection for secondary installations.',
    },
    {
      id: 'sense_harness',
      name: 'Voltage & Temperature Sense Wiring Harness',
      component_type: 'Sensor Signal Distribution',
      pack_function: 'Channels individual cell tap voltages and thermistor temperature signals back to the BMS.',
      specifications: {
        wiring_type: 'Multi-conductor harness with tinned copper conductors and locking connectors',
        sensors: 'Integrated NTC 10kΩ thermistors distributed across modules',
      },
      recorded_condition: 'Harness intact; pins and locking tabs undamaged',
      known_faults: 'None documented',
      potential_applications: [
        'Reused with Compatible Stationary BMS Controllers',
        'Granulated Copper Wire Scrap Recycling (99% Cu)',
      ],
      testing_required: [
        'Pin-to-pin wiring continuity check',
        'Insulation resistance test between channels (> 100 MΩ)',
      ],
      suggested_pathway: 'Potentially reusable pending assessment',
      pathway_reason: 'Reusable if locking pins and insulation are intact; otherwise easily recycled for copper recovery.',
    },
    {
      id: 'insulation',
      name: 'Dielectric Barriers & Fire Insulation',
      component_type: 'Electrical Safety & Thermal Barrier',
      pack_function: 'Provides galvanic electrical insulation and fireproof thermal barrier between cells.',
      specifications: {
        materials: 'Silica aerogel blankets, compressed mica laminates, and aramid sheets',
        dielectric_rating: '> 2500V DC breakdown strength',
      },
      recorded_condition: 'Installed in module stacks; requires visual inspection upon pack disassembly',
      known_faults: 'None documented',
      potential_applications: [
        'Inter-Module Partitions in Stationary Storage Cabinets',
        'High-Temperature Industrial Thermal Barriers',
        'Specialized Mineral Scrap Recovery',
      ],
      testing_required: [
        'Dielectric withstand voltage test (> 2500V DC)',
        'Visual inspection for tearing or compression set',
      ],
      suggested_pathway: 'Repair or refurbishment may be required',
      pathway_reason: 'Thermal blankets may experience mechanical set during removal and should be inspected or augmented.',
    },
  ]
}
