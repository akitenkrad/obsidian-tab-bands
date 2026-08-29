import { App, Plugin, PluginSettingTab, Setting, debounce } from "obsidian";
import { t } from "./i18n";
import { CHIP_NAME_WIDTH, type TabBandsSettings } from "./settings";

/**
 * 設定画面から見たプラグイン側の口．
 *
 * main.ts を import すると main -> settings-tab -> main の循環になるので，
 * 必要な 2 つだけをインタフェースで受ける．
 */
export interface SettingsHost {
  readonly settings: Readonly<TabBandsSettings>;
  updateSettings(patch: Partial<TabBandsSettings>): Promise<void>;
}

/**
 * Obsidian の設定画面 (設定 → コミュニティプラグイン → Tab Bands).
 *
 * 独自 UI は作らず，本体の設定画面に相乗りする．文言は i18n を通す
 * (英語が既定．日本語表示の Obsidian でだけ日本語になる).
 */
export class TabBandsSettingTab extends PluginSettingTab {
  /**
   * スライダーは 1 目盛りごとに onChange が飛ぶ．そのたびに data.json を
   * 書いて再描画すると重いので，止まってから 1 回だけ確定させる．
   */
  private commitWidth = debounce(
    (value: number) => void this.host.updateSettings({ chipNameMaxWidth: value }),
    200,
    true,
  );

  constructor(
    app: App,
    private host: Plugin & SettingsHost,
  ) {
    super(app, host);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(t("settingChipWidthName"))
      .setDesc(t("settingChipWidthDesc"))
      .addSlider((slider) =>
        slider
          .setLimits(CHIP_NAME_WIDTH.min, CHIP_NAME_WIDTH.max, CHIP_NAME_WIDTH.step)
          .setValue(this.host.settings.chipNameMaxWidth)
          .setDynamicTooltip()
          .onChange((value) => this.commitWidth(value)),
      );

    new Setting(containerEl)
      .setName(t("settingAbsorbName"))
      .setDesc(t("settingAbsorbDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.host.settings.absorbNewTabs)
          .onChange((value) => void this.host.updateSettings({ absorbNewTabs: value })),
      );
  }
}
