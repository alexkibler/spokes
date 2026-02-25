import Phaser from 'phaser';
import type { SurfaceType } from '../core/course/CourseProfile';
import { THEME } from '../theme';

const W = 960;
const H = 540;
const WORLD_SCALE = 50;

interface LayerDef {
  key: string;
  parallax: number;
  draw: (g: Phaser.GameObjects.Graphics) => void;
}

export class ParallaxBackground {
  private scene: Phaser.Scene;
  private worldContainer: Phaser.GameObjects.Container;

  private layerMountains!: Phaser.GameObjects.TileSprite;
  private layerMidHills!: Phaser.GameObjects.TileSprite;
  private layerNearGround!: Phaser.GameObjects.TileSprite;
  private roadLayers!: Record<SurfaceType, Phaser.GameObjects.TileSprite>;

  private currentSurface: SurfaceType = 'asphalt';

  constructor(scene: Phaser.Scene, worldContainer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.worldContainer = worldContainer;
    this.buildParallaxLayers();
  }

  public update(smoothVelocityMs: number, isBackwards: boolean, dt: number): void {
    const baseScroll = smoothVelocityMs * WORLD_SCALE * dt;
    const dir = isBackwards ? -1 : 1;

    if (this.layerMountains) this.layerMountains.tilePositionX += baseScroll * 0.10 * dir;
    if (this.layerMidHills) this.layerMidHills.tilePositionX  += baseScroll * 0.30 * dir;
    if (this.layerNearGround) this.layerNearGround.tilePositionX += baseScroll * 0.65 * dir;

    if (this.roadLayers) {
      for (const tile of Object.values(this.roadLayers)) {
        tile.tilePositionX += baseScroll * 1.00 * dir;
      }
    }
  }

  public setSurface(surface: SurfaceType): void {
    if (this.currentSurface !== surface) {
      this.currentSurface = surface;
      this.switchRoadLayer(surface);
    }
  }

  public onResize(width: number, height: number): void {
    const tileScaleY = height / H;
    const roadTiles = this.roadLayers ? (Object.values(this.roadLayers) as Phaser.GameObjects.TileSprite[]) : [];
    [this.layerMountains, this.layerMidHills, this.layerNearGround, ...roadTiles].forEach(tile => {
      if (tile) {
        tile.setSize(width, height);
        tile.setTileScale(1, tileScaleY);
        tile.setPosition(-width / 2, -height / 2);
      }
    });
  }

  private buildParallaxLayers(): void {
    const layers: LayerDef[] = [
      { key: 'mountains', parallax: 0.10, draw: (g) => this.drawMountains(g) },
      { key: 'midHills', parallax: 0.30, draw: (g) => this.drawMidHills(g) },
      { key: 'nearGround', parallax: 0.65, draw: (g) => this.drawNearGround(g) },
    ];

    for (const layer of layers) {
      if (!this.scene.textures.exists(layer.key)) {
        const g = this.scene.add.graphics();
        layer.draw(g);
        g.generateTexture(layer.key, W, H);
        g.destroy();
      }

      const sprite = this.scene.add.tileSprite(-W / 2, -H / 2, W, H, layer.key).setOrigin(0, 0);
      this.worldContainer.add(sprite);
      if (layer.key === 'mountains') this.layerMountains = sprite;
      else if (layer.key === 'midHills') this.layerMidHills = sprite;
      else if (layer.key === 'nearGround') this.layerNearGround = sprite;
    }

    const roadDrawers: Record<SurfaceType, (g: Phaser.GameObjects.Graphics) => void> = {
      asphalt: (g) => this.drawRoad(g),
      gravel:  (g) => this.drawRoadGravel(g),
      dirt:    (g) => this.drawRoadDirt(g),
      mud:     (g) => this.drawRoadMud(g),
    };

    const roadSprites = {} as Record<SurfaceType, Phaser.GameObjects.TileSprite>;
    for (const [surface, drawFn] of Object.entries(roadDrawers) as [SurfaceType, any][]) {
      const key = `road_${surface}`;
      if (!this.scene.textures.exists(key)) {
        const g = this.scene.add.graphics();
        drawFn(g);
        g.generateTexture(key, W, H);
        g.destroy();
      }

      const sprite = this.scene.add.tileSprite(-W / 2, -H / 2, W, H, key)
        .setOrigin(0, 0).setVisible(surface === this.currentSurface);
      this.worldContainer.add(sprite);
      roadSprites[surface] = sprite;
    }
    this.roadLayers = roadSprites;
  }

  private switchRoadLayer(surface: SurfaceType): void {
    for (const [key, tile] of Object.entries(this.roadLayers)) {
      tile.setVisible(key === surface);
    }
  }

  private drawMountains(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(THEME.colors.parallax.mountainsFill, 1);
    g.fillPoints([{x:0,y:H},{x:0,y:200},{x:80,y:115},{x:200,y:190},{x:320,y:130},{x:430,y:200},{x:560,y:120},{x:680,y:175},{x:780,y:115},{x:880,y:165},{x:960,y:145},{x:960,y:H}], true);
  }
  private drawMidHills(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(THEME.colors.parallax.midHillsFill, 1);
    g.fillPoints([{x:0,y:H},{x:0,y:340},{x:60,y:300},{x:150,y:275},{x:270,y:310},{x:390,y:280},{x:510,y:340},{x:630,y:285},{x:750,y:310},{x:870,y:275},{x:960,y:310},{x:960,y:H}], true);
  }
  private drawNearGround(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(THEME.colors.parallax.nearGroundFill, 1);
    g.fillPoints([{x:0,y:H},{x:0,y:400},{x:100,y:380},{x:220,y:395},{x:350,y:375},{x:480,y:390},{x:610,y:378},{x:740,y:400},{x:860,y:382},{x:960,y:395},{x:960,y:H}], true);
  }
  private drawRoad(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(THEME.colors.parallax.asphaltBase, 1); g.fillRect(0, 420, W, H - 420);
    g.fillStyle(THEME.colors.parallax.asphaltEdge, 1); g.fillRect(0, 420, W, 4); g.fillRect(0, H - 4, W, 4);
    g.fillStyle(THEME.colors.parallax.asphaltDash, 0.7);
    for (let x = 0; x < W; x += 70) g.fillRect(x, 455, 40, 4);
  }
  private drawRoadGravel(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(THEME.colors.parallax.gravelBase, 1); g.fillRect(0, 420, W, H - 420);
    g.fillStyle(THEME.colors.parallax.gravelEdge, 1); g.fillRect(0, 420, W, 5); g.fillRect(0, H - 5, W, 5);
    let seed = 42; const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < 220; i++) {
      g.fillStyle(rand() > 0.5 ? THEME.colors.parallax.gravelStoneDark : THEME.colors.parallax.gravelStoneLight, 0.9);
      g.fillEllipse(rand() * W, 425 + rand() * (H - 430), 2 + rand() * 5, 2 + rand() * 3);
    }
  }
  private drawRoadDirt(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(THEME.colors.parallax.dirtBase, 1); g.fillRect(0, 420, W, H - 420);
    g.fillStyle(THEME.colors.parallax.dirtEdge, 1); g.fillRect(0, 420, W, 5); g.fillRect(0, H - 5, W, 5);
    g.fillStyle(THEME.colors.parallax.dirtRut, 0.85); g.fillRect(0, 437, W, 6); g.fillRect(0, 500, W, 6);
    let seed = 17; const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < 80; i++) {
      g.fillStyle(rand() > 0.5 ? THEME.colors.parallax.dirtPatchLight : THEME.colors.parallax.dirtPatchDark, 0.7);
      g.fillRect(rand() * W, 426 + rand() * (H - 432), 2 + rand() * 4, 2 + rand() * 3);
    }
  }
  private drawRoadMud(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(THEME.colors.parallax.mudBase, 1); g.fillRect(0, 420, W, H - 420);
    g.fillStyle(THEME.colors.parallax.mudEdge, 1); g.fillRect(0, 420, W, 6); g.fillRect(0, H - 6, W, 6);
    g.fillStyle(THEME.colors.parallax.mudDeep, 0.9); g.fillRect(0, 433, W, 12); g.fillRect(0, 492, W, 12);
    let seed = 99; const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < 60; i++) {
      g.fillStyle(THEME.colors.parallax.mudEdge, 0.6);
      g.fillEllipse(rand() * W, 426 + rand() * (H - 432), 3 + rand() * 8, 2 + rand() * 4);
    }
  }
}
