// src/roguelike/content/ContentBootstrapper.ts

import { ContentRegistry } from '../registry/ContentRegistry';

// Items
import { TailwindConsumable } from './items/TailwindConsumable';
import { AeroHelmet } from './items/AeroHelmet';
import { GoldCrank } from './items/GoldCrank';
import { TeleportConsumable } from './items/TeleportConsumable';
import { RerollVoucher } from './items/RerollVoucher';
import { DirtTires } from './items/DirtTires';
import { AntigravPedals } from './items/AntigravPedals';
import { CarbonFrame } from './items/CarbonFrame';
import { FerryToken } from './items/FerryToken';
import { FunicularTicket } from './items/FunicularTicket';
import { TrailMachete } from './items/TrailMachete';
import * as Medals from './items/Medals';

// Rewards
import * as GoldRewards from './rewards/GoldRewards';
import * as StatRewards from './rewards/StatRewards';
import * as ItemRewards from './rewards/ItemRewards';

export class ContentBootstrapper {
  public static bootstrap(registry: ContentRegistry): void {
    // Register Items
    registry.registerItem(TailwindConsumable);
    registry.registerItem(AeroHelmet);
    registry.registerItem(GoldCrank);
    registry.registerItem(TeleportConsumable);
    registry.registerItem(RerollVoucher);
    registry.registerItem(DirtTires);
    registry.registerItem(AntigravPedals);
    registry.registerItem(CarbonFrame);
    registry.registerItem(FerryToken);
    registry.registerItem(FunicularTicket);
    registry.registerItem(TrailMachete);

    Object.values(Medals).forEach(medal => registry.registerItem(medal));

    // Register Rewards
    Object.values(GoldRewards).forEach(reward => registry.registerReward(reward));
    Object.values(StatRewards).forEach(reward => registry.registerReward(reward));
    Object.values(ItemRewards).forEach(reward => registry.registerReward(reward));

    console.log('[ContentBootstrapper] Content registered successfully.');
  }
}
