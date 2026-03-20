"""
Super Mario - 单关卡 pygame 游戏
使用玩家提供的 Mario 图片
"""

import pygame
import sys
from pathlib import Path

# 初始化 pygame
pygame.init()

# 游戏常量
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
FPS = 60
GRAVITY = 0.8
JUMP_SPEED = -15
MOVE_SPEED = 5

# 颜色
SKY_BLUE = (107, 140, 255)
GREEN = (34, 139, 34)
BROWN = (139, 69, 19)
ORANGE = (255, 165, 0)
RED = (255, 0, 0)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

# 创建窗口
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("Super Mario - 关卡 1")
clock = pygame.time.Clock()

# 资源路径
SPRITE_DIR = Path(r"C:\software\super-mario")
MARIO_IMAGE = SPRITE_DIR / "player.png"

# 加载马里奥图片
def load_mario_image():
    try:
        img = pygame.image.load(str(MARIO_IMAGE))
        # 缩放到合适大小
        img = pygame.transform.scale(img, (50, 60))
        return img
    except pygame.error:
        # 如果加载失败，创建一个简单的矩形代替
        surface = pygame.Surface((50, 60))
        surface.fill(RED)
        return surface

class Mario(pygame.sprite.Sprite):
    """马里奥角色"""
    
    def __init__(self):
        super().__init__()
        self.image = load_mario_image()
        self.rect = self.image.get_rect()
        self.rect.x = 50
        self.rect.y = SCREEN_HEIGHT - 150
        self.vel_x = 0
        self.vel_y = 0
        self.on_ground = False
        self.facing_right = True
        self.coins = 0
        self.lives = 3
    
    def update(self, platforms: list, enemies: list, coins: list):
        """更新马里奥状态"""
        # 键盘输入
        keys = pygame.key.get_pressed()
        
        # 水平移动
        self.vel_x = 0
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.vel_x = -MOVE_SPEED
            self.facing_right = False
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.vel_x = MOVE_SPEED
            self.facing_right = True
        
        # 跳跃
        if (keys[pygame.K_SPACE] or keys[pygame.K_UP] or keys[pygame.K_w]) and self.on_ground:
            self.vel_y = JUMP_SPEED
            self.on_ground = False
        
        # 应用重力
        self.vel_y += GRAVITY
        
        # 水平移动
        self.rect.x += self.vel_x
        
        # 水平方向碰撞检测
        for platform in platforms:
            if self.rect.colliderect(platform.rect):
                if self.vel_x > 0:
                    self.rect.right = platform.rect.left
                elif self.vel_x < 0:
                    self.rect.left = platform.rect.right
        
        # 垂直移动
        self.rect.y += self.vel_y
        self.on_ground = False
        
        # 垂直方向碰撞检测
        for platform in platforms:
            if self.rect.colliderect(platform.rect):
                if self.vel_y > 0:
                    self.rect.bottom = platform.rect.top
                    self.vel_y = 0
                    self.on_ground = True
                elif self.vel_y < 0:
                    self.rect.top = platform.rect.bottom
                    self.vel_y = 0
        
        # 边界限制
        if self.rect.left < 0:
            self.rect.left = 0
        if self.rect.right > SCREEN_WIDTH:
            self.rect.right = SCREEN_WIDTH
        
        # 与敌人碰撞
        for enemy in enemies:
            if self.rect.colliderect(enemy.rect):
                # 从上面踩可以消灭敌人
                if self.vel_y > 0 and self.rect.bottom < enemy.rect.centery:
                    enemy.kill()
                    self.vel_y = JUMP_SPEED
                    self.coins += 100
                else:
                    self.lives -= 1
                    self.rect.x = 50
                    self.rect.y = SCREEN_HEIGHT - 150
                    if self.lives <= 0:
                        print(f"游戏结束！最终得分: {self.coins}")
                        pygame.quit()
                        sys.exit()
        
        # 与金币碰撞
        for coin in coins:
            if self.rect.colliderect(coin.rect):
                coin.kill()
                self.coins += 10
        
        # 掉落屏幕底部
        if self.rect.top > SCREEN_HEIGHT:
            self.lives -= 1
            self.rect.x = 50
            self.rect.y = SCREEN_HEIGHT - 150
    
    def draw(self, surface):
        """绘制马里奥"""
        if not self.facing_right:
            img = pygame.transform.flip(self.image, True, False)
        else:
            img = self.image
        surface.blit(img, self.rect)


class Platform(pygame.sprite.Sprite):
    """平台类"""
    
    def __init__(self, x: int, y: int, width: int, height: int, color=GREEN):
        super().__init__()
        self.image = pygame.Surface((width, height))
        self.image.fill(color)
        # 添加草地纹理
        pygame.draw.rect(self.image, (0, 100, 0), (0, 0, width, 10))
        self.rect = self.image.get_rect()
        self.rect.x = x
        self.rect.y = y


class Enemy(pygame.sprite.Sprite):
    """敌人（Goomba）"""
    
    def __init__(self, x: int, y: int):
        super().__init__()
        self.image = pygame.Surface((40, 40))
        self.image.fill(BROWN)
        # 画简单的敌人脸
        pygame.draw.circle(self.image, ORANGE, (20, 15), 10)
        pygame.draw.circle(self.image, WHITE, (15, 12), 3)
        pygame.draw.circle(self.image, WHITE, (25, 12), 3)
        self.rect = self.image.get_rect()
        self.rect.x = x
        self.rect.y = y
        self.vel_x = -2
    
    def update(self):
        """敌人 AI"""
        self.rect.x += self.vel_x
        # 简单巡逻 AI


class Coin(pygame.sprite.Sprite):
    """金币"""
    
    def __init__(self, x: int, y: int):
        super().__init__()
        self.image = pygame.Surface((30, 30))
        self.image.fill(ORANGE)
        pygame.draw.circle(self.image, YELLOW := (255, 215, 0), (15, 15), 12)
        self.rect = self.image.get_rect()
        self.rect.x = x
        self.rect.y = y


class Brick(pygame.sprite.Sprite):
    """砖块"""
    
    def __init__(self, x: int, y: int):
        super().__init__()
        self.image = pygame.Surface((40, 40))
        self.image.fill(BROWN)
        # 砖块纹理
        pygame.draw.rect(self.image, (100, 50, 0), (0, 0, 40, 40), 2)
        pygame.draw.line(self.image, (100, 50, 0), (0, 20), (40, 20), 2)
        pygame.draw.line(self.image, (100, 50, 0), (20, 0), (20, 20), 2)
        pygame.draw.line(self.image, (100, 50, 0), (20, 20), (20, 40), 2)
        self.rect = self.image.get_rect()
        self.rect.x = x
        self.rect.y = y


def create_level():
    """创建关卡"""
    platforms = pygame.sprite.Group()
    enemies = pygame.sprite.Group()
    coins = pygame.sprite.Group()
    bricks = pygame.sprite.Group()
    
    # 地面
    for x in range(0, SCREEN_WIDTH * 3, 100):
        platforms.add(Platform(x, SCREEN_HEIGHT - 50, 100, 50))
    
    # 平台 1 - 起点区域
    platforms.add(Platform(200, 450, 150, 20))
    platforms.add(Platform(400, 400, 100, 20))
    
    # 砖块区
    for bx in range(500, 700, 40):
        bricks.add(Brick(bx, 350))
        bricks.add(Brick(bx, 390))
    
    # 中间挑战区
    platforms.add(Platform(750, 350, 100, 20))
    platforms.add(Platform(900, 300, 80, 20))
    platforms.add(Platform(1050, 350, 120, 20))
    
    # 高平台
    platforms.add(Platform(1200, 250, 100, 20))
    
    # 砖块装饰
    for bx in range(1150, 1250, 40):
        bricks.add(Brick(bx, 210))
    
    # 终点区域
    platforms.add(Platform(1350, 400, 100, 20))
    platforms.add(Platform(1500, 450, 200, 20))
    
    # 终点旗杆
    flag_x = 1650
    platforms.add(Platform(flag_x, 300, 10, 250))
    
    # 敌人分布
    enemies.add(Enemy(350, SCREEN_HEIGHT - 90))
    enemies.add(Enemy(600, SCREEN_HEIGHT - 90))
    enemies.add(Enemy(850, SCREEN_HEIGHT - 90))
    enemies.add(Enemy(1100, SCREEN_HEIGHT - 90))
    enemies.add(Enemy(1400, SCREEN_HEIGHT - 90))
    
    # 敌人也在平台上
    enemies.add(Enemy(750, 310))
    enemies.add(Enemy(1050, 310))
    
    # 金币分布
    coins_pos = [
        (220, 400), (240, 400),
        (420, 350), (440, 350),
        (600, 300), (620, 300),
        (800, 300), (820, 300),
        (920, 250), (940, 250),
        (1100, 300), (1120, 300),
        (1220, 200), (1240, 200),
        (1400, 350), (1420, 350),
    ]
    for cx, cy in coins_pos:
        coins.add(Coin(cx, cy))
    
    # 将砖块也加入平台碰撞
    for brick in bricks:
        platforms.add(brick)
    
    return platforms, enemies, coins, bricks


def draw_text(surface, text: str, x: int, y: int, size: int = 24, color: tuple = WHITE):
    """绘制文字"""
    font = pygame.font.Font(None, size)
    text_surface = font.render(text, True, color)
    surface.blit(text_surface, (x, y))


def main():
    """主游戏循环"""
    mario = Mario()
    platforms, enemies, coins, bricks = create_level()
    
    # 摄像机偏移（用于卷轴）
    camera_x = 0
    
    running = True
    while running:
        # 事件处理
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_r:
                    # 重新开始
                    mario = Mario()
                    platforms, enemies, coins, bricks = create_level()
                    camera_x = 0
        
        # 更新游戏逻辑
        mario.update(platforms, enemies, coins, coins)
        enemies.update()
        
        # 摄像机跟随
        target_camera_x = mario.rect.x - SCREEN_WIDTH // 3
        camera_x += (target_camera_x - camera_x) * 0.1
        camera_x = max(0, camera_x)
        
        # 检测到达终点
        if mario.rect.x > 1650:
            print(f"恭喜通关！得分: {mario.coins}, 生命: {mario.lives}")
            running = False
        
        # 绘制
        screen.fill(SKY_BLUE)
        
        # 绘制背景装饰（云和草丛）
        for i in range(10):
            # 云朵
            cloud_x = (i * 200 - camera_x * 0.3) % (SCREEN_WIDTH + 200) - 100
            pygame.draw.ellipse(screen, WHITE, (cloud_x, 80 + (i % 3) * 30, 80, 40))
            pygame.draw.ellipse(screen, WHITE, (cloud_x + 20, 60 + (i % 3) * 30, 60, 40))
        
        # 绘制所有元素（考虑摄像机偏移）
        for platform in platforms:
            screen.blit(platform.image, (platform.rect.x - camera_x, platform.rect.y))
        
        for brick in bricks:
            screen.blit(brick.image, (brick.rect.x - camera_x, brick.rect.y))
        
        for enemy in enemies:
            screen.blit(enemy.image, (enemy.rect.x - camera_x, enemy.rect.y))
        
        for coin in coins:
            screen.blit(coin.image, (coin.rect.x - camera_x, coin.rect.y))
        
        # 绘制马里奥
        screen.blit(
            pygame.transform.flip(mario.image, not mario.facing_right, False) 
            if not mario.facing_right else mario.image,
            (mario.rect.x - camera_x, mario.rect.y)
        )
        
        # 绘制终点旗杆
        flag_x = 1650 - camera_x
        pygame.draw.rect(screen, GREEN, (flag_x, 50, 10, 500))
        pygame.draw.polygon(screen, RED, [(flag_x + 5, 50), (flag_x + 55, 80), (flag_x + 5, 110)])
        
        # HUD - 生命和金币
        draw_text(screen, f"生命: {mario.lives}", 10, 10, 30)
        draw_text(screen, f"金币: {mario.coins}", 10, 45, 30)
        draw_text(screen, "方向键/WASD移动 空格跳跃 ESC退出 R重开", 10, SCREEN_HEIGHT - 30, 20)
        
        # 更新显示
        pygame.display.flip()
        clock.tick(FPS)
    
    pygame.quit()
    print("游戏已退出")


if __name__ == "__main__":
    main()
