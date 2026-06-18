# Waveshare UPS Card

A responsive Home Assistant dashboard card for Waveshare UPS battery, health, test, calibration, and control entities. Configuration is available entirely through Home Assistant's visual card editor.

## Installation

### HACS custom repository

1. Open HACS and add `https://github.com/ComputerWhisperers/Waveshare-UPS-Card` as a **Dashboard** custom repository.
2. Install **Waveshare UPS Card**.
3. Refresh the browser, then add **Custom: Waveshare UPS Card** to a dashboard.

### Manual

1. Copy `waveshare-ups-card.js` to `/config/www/waveshare-ups-card.js`.
2. Open **Settings > Dashboards > Resources** in Home Assistant.
3. Add `/local/waveshare-ups-card.js` as a **JavaScript module**.
4. Refresh the browser, then add **Custom: Waveshare UPS Card** to a dashboard.

## Configuration

Add the card, open its **Configuration** tab, and select any entity belonging to the UPS as the **Main UPS entity**. The card uses Home Assistant's device registry to populate the related sensors and buttons automatically. You can override any discovered value with the individual selectors. If no main entity is selected, all individual selectors continue to work on their own. Unconfigured rows and sections are hidden.

YAML remains supported, but is not required:

```yaml
type: custom:waveshare-ups-card
title: UPS Power
layout: auto
ups_entity: sensor.waveshare_ups_status
battery_entity: sensor.waveshare_ups_battery_capacity
runtime_entity: sensor.waveshare_ups_runtime
status_entity: sensor.waveshare_ups_status
battery_voltage_entity: sensor.waveshare_ups_battery_voltage
current_entity: sensor.waveshare_ups_current
power_entity: sensor.waveshare_ups_power
```

The default `auto` layout shows the battery, runtime, operating state, electrical metrics, health indicators, and icon controls. `compact` removes the electrical metric tiles while retaining the same element sizes, indicators, and controls. `full` adds battery health and test history, while `minimal` keeps the primary gauge and health indicators. Every layout requests automatic grid height in Home Assistant Sections layouts.

## Options

| Option | Description |
| --- | --- |
| `title` | Card title; defaults to `UPS Power` |
| `layout` | `auto`, `full`, `compact`, or `minimal` |
| `metric_columns` | One or two telemetry columns |
| `ups_entity` | Any entity belonging to the UPS device; used for automatic discovery |
| `battery_entity` | Battery percentage sensor |
| `runtime_entity` | Estimated runtime sensor |
| `status_entity` | UPS operating-status sensor |
| `*_entity` | Additional telemetry and history sensors |
| `*_button` | UPS control button entities |
| `show_*` | Visibility controls for optional sections |
