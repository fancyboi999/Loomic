# Lemon Squeezy 产品创建指南

> 代码已全部就绪，你只需要在 Lemon Squeezy Dashboard 创建产品，然后把 variant ID 填到 `.env.local` 即可。

## 步骤 1：创建 4 个产品（逐个创建）

登录 [app.lemonsqueezy.com](https://app.lemonsqueezy.com)，点击 **Add Product**。

---

### 产品 1: Loomic Starter

**General 区域：**
| 字段 | 填写内容 |
|------|---------|
| **Name** | `Loomic Starter` |
| **Description** | `AI creative workspace for individual creators. 1,200 credits/month, all image models, 2 concurrent tasks.` |

**Pricing 区域：**
| 字段 | 选择/填写 |
|------|---------|
| **类型** | 选 **Subscription**（不是 Single payment！） |
| **Pricing model** | **Standard pricing** |
| **Price** | `CN¥89` |
| **Billing period** | **Monthly** |
| **Tax category** | `Software as a service (SaaS) - personal use` |

**Media：** 可以不传，后续再加

**Files：** 不需要传，我们是 SaaS 不是文件下载

**Variants：** 先不加，创建产品后再加 Yearly variant

**Settings 区域：**
| 字段 | 选择 |
|------|------|
| **Generate license keys** | ❌ 关闭 |
| **Display product on storefront** | ✅ 开启 |
| **Confirmation modal** | 默认即可 |
| **Email receipt** | ✅ 开启（让用户收到支付确认邮件） |

点击 **Publish** 创建产品。

---

### 创建 Yearly Variant

产品创建后，进入产品详情页：

1. 找到 **Variants** 区域，点击 **Add variant**
2. 填写：

| 字段 | 填写内容 |
|------|---------|
| **Name** | `Yearly` |
| **Price** | `CN¥649` |
| **Billing period** | 选 **Yearly** |

> 这样产品就有两个 variant：默认的 Monthly (¥89/月) 和新加的 Yearly (¥649/年)

3. 保存

---

### 产品 2: Loomic Pro

**创建方式同上，字段如下：**

| 字段 | 内容 |
|------|------|
| **Name** | `Loomic Pro` |
| **Description** | `Professional AI creative workspace. 5,000 credits/month, all image & video models, 4 concurrent tasks, 2K resolution.` |
| **Pricing 类型** | **Subscription** |
| **Price** | `CN¥289` (Monthly) |
| **Tax category** | `Software as a service (SaaS) - personal use` |

创建后添加 Yearly variant：**Name** = `Yearly`, **Price** = `CN¥2149`

---

### 产品 3: Loomic Ultra

| 字段 | 内容 |
|------|------|
| **Name** | `Loomic Ultra` |
| **Description** | `Team AI creative workspace. 15,000 credits/month, all models, 8 concurrent tasks, 4K resolution, 3 team seats.` |
| **Pricing 类型** | **Subscription** |
| **Price** | `CN¥719` (Monthly) |
| **Tax category** | `Software as a service (SaaS) - business use` |

创建后添加 Yearly variant：**Name** = `Yearly`, **Price** = `CN¥5749`

---

### 产品 4: Loomic Business

| 字段 | 内容 |
|------|------|
| **Name** | `Loomic Business` |
| **Description** | `Enterprise AI creative production. 50,000 credits/month, all models, 12 concurrent tasks, 4K resolution, 10+ team seats, API access.` |
| **Pricing 类型** | **Subscription** |
| **Price** | `CN¥1799` (Monthly) |
| **Tax category** | `Software as a service (SaaS) - business use` |

创建后添加 Yearly variant：**Name** = `Yearly`, **Price** = `CN¥14389`

---

## 步骤 2：记录 Variant ID

每个产品创建完后，进入产品详情页 → Variants 列表。

每个 variant 旁边会有一个数字 ID（也可以在 URL 中看到，或者通过 API 查询）。

快捷查询方式 — 在终端运行：
```bash
curl -s "https://api.lemonsqueezy.com/v1/variants?filter[product_id]=你的产品ID" \
  -H "Authorization: Bearer 你的API_KEY" \
  -H "Accept: application/vnd.api+json" | python3 -c "
import sys,json
for v in json.load(sys.stdin)['data']:
    a = v['attributes']
    print(f\"  Variant ID: {v['id']} | {a['name']} | {a['price']/100} CNY | {a.get('interval','one-time')}\")
"
```

## 步骤 3：填入 `.env.local`

把 8 个 variant ID 填进去（替换空值）：

```bash
LEMONSQUEEZY_VARIANT_STARTER_MONTHLY=你的ID
LEMONSQUEEZY_VARIANT_STARTER_YEARLY=你的ID
LEMONSQUEEZY_VARIANT_PRO_MONTHLY=你的ID
LEMONSQUEEZY_VARIANT_PRO_YEARLY=你的ID
LEMONSQUEEZY_VARIANT_ULTRA_MONTHLY=你的ID
LEMONSQUEEZY_VARIANT_ULTRA_YEARLY=你的ID
LEMONSQUEEZY_VARIANT_BUSINESS_MONTHLY=你的ID
LEMONSQUEEZY_VARIANT_BUSINESS_YEARLY=你的ID
```

## 步骤 4：配置 Webhook

1. 打开 [app.lemonsqueezy.com/settings/webhooks](https://app.lemonsqueezy.com/settings/webhooks)
2. 编辑之前创建的 webhook（secret = `your-webhook-secret`）
3. 更新 Callback URL：
   - 本地测试：先运行 `ngrok http 3001`，然后填 `https://xxx.ngrok.io/api/payments/webhook`
   - 生产环境：`https://your-domain.com/api/payments/webhook`
4. 确保勾选了以下事件：
   - ✅ `subscription_created`
   - ✅ `subscription_updated`
   - ✅ `subscription_cancelled`
   - ✅ `subscription_payment_success`
   - ✅ `subscription_payment_failed`
   - ✅ `order_created`

## 步骤 5：启动并测试

```bash
pnpm dev
```

1. 打开 http://localhost:3000/pricing
2. 点击任意付费套餐的按钮
3. 弹出 Lemon Squeezy checkout 弹窗
4. 使用测试卡号：`4242 4242 4242 4242`，有效期随意填未来日期，CVC 随意填 3 位数
5. 完成支付后 webhook 自动触发
6. 检查 Settings → Billing 页面
7. 检查侧边栏积分余额是否增加
