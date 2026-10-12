package com.deepseek.galgame.mobile;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * 沉浸式全屏（初期写法）：隐藏系统状态栏与导航栏，内容延伸到刘海区铺满整屏。
     * 用户从屏幕边缘上/下滑动时系统栏临时浮现，随后自动收回。
     */
    private void enterImmersiveFullscreen() {
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller == null) {
            return;
        }
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        enterImmersiveFullscreen();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // WebView 加载布局 / 系统焦点变化后系统栏可能重新冒出来，获焦时再隐藏一次
        if (hasFocus) {
            enterImmersiveFullscreen();
        }
    }
}