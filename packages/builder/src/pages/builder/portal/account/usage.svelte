<script>
  import {
    Body,
    Divider,
    Heading,
    Layout,
    notifications,
    Detail,
    Link,
    TooltipWrapper,
  } from "@budibase/bbui"
  import { onMount } from "svelte"
  import { admin, auth, licensing } from "stores/portal"
  import { Constants } from "@budibase/frontend-core"
  import { DashCard, Usage } from "components/usage"
  import { PlanModel } from "constants"

  let staticUsage = []
  let monthlyUsage = []
  let cancelAt
  let loaded = false
  let textRows = []
  let daysRemainingInMonth
  let primaryActionText

  const upgradeUrl = `${$admin.accountPortalUrl}/portal/upgrade`
  const manageUrl = `${$admin.accountPortalUrl}/portal/billing`

  const WARN_USAGE = ["Queries", "Automations", "Rows", "Day Passes", "Users"]

  const EXCLUDE_QUOTAS = {
    Queries: () => true,
    Users: license => {
      return license.plan.model !== PlanModel.PER_USER
    },
    "Day Passes": license => {
      return license.plan.model !== PlanModel.DAY_PASS
    },
  }

  function excludeQuota(name) {
    return EXCLUDE_QUOTAS[name] && EXCLUDE_QUOTAS[name](license)
  }

  $: quotaUsage = $licensing.quotaUsage
  $: license = $auth.user?.license
  $: accountPortalAccess = $auth?.user?.accountPortalAccess
  $: quotaReset = quotaUsage?.quotaReset
  $: canManagePlan =
    ($admin.cloud && accountPortalAccess) || (!$admin.cloud && $auth.isAdmin)

  const setMonthlyUsage = () => {
    monthlyUsage = []
    if (quotaUsage.monthly) {
      for (let [key, value] of Object.entries(license.quotas.usage.monthly)) {
        if (excludeQuota(value.name)) {
          continue
        }
        const used = quotaUsage.monthly.current[key]
        if (value.value !== 0) {
          monthlyUsage.push({
            name: value.name,
            used: used ? used : 0,
            total: value.value,
          })
        }
      }
    }
    monthlyUsage = monthlyUsage.sort((a, b) => a.name.localeCompare(b.name))
  }

  const setStaticUsage = () => {
    staticUsage = []
    for (let [key, value] of Object.entries(license.quotas.usage.static)) {
      if (excludeQuota(value.name)) {
        continue
      }
      const used = quotaUsage.usageQuota[key]
      if (value.value !== 0) {
        staticUsage.push({
          name: value.name,
          used: used ? used : 0,
          total: value.value,
        })
      }
    }
    staticUsage = staticUsage.sort((a, b) => a.name.localeCompare(b.name))
  }

  const setCancelAt = () => {
    cancelAt = license?.billing?.subscription?.cancelAt
  }

  const capitalise = string => {
    if (string) {
      return string.charAt(0).toUpperCase() + string.slice(1)
    }
  }

  const planTitle = () => {
    return `${capitalise(license?.plan.type)} Plan`
  }

  const getDaysRemaining = timestamp => {
    if (!timestamp) {
      return
    }
    const now = new Date()
    now.setHours(0)
    now.setMinutes(0)

    const thenDate = new Date(timestamp)
    thenDate.setHours(0)
    thenDate.setMinutes(0)

    const difference = thenDate.getTime() - now
    // return the difference in days
    return (difference / (1000 * 3600 * 24)).toFixed(0)
  }

  const setTextRows = () => {
    textRows = []

    if (cancelAt) {
      textRows.push({ message: "Subscription has been cancelled" })
      textRows.push({
        message: `${getDaysRemaining(cancelAt)} days remaining`,
        tooltip: new Date(cancelAt),
      })
    }
  }

  const setDaysRemainingInMonth = () => {
    const resetDate = new Date(quotaReset)

    const now = new Date()
    const difference = resetDate.getTime() - now.getTime()

    // return the difference in days
    daysRemainingInMonth = (difference / (1000 * 3600 * 24)).toFixed(0)
  }

  const goToAccountPortal = () => {
    if (license?.plan.type === Constants.PlanType.FREE) {
      window.location.href = upgradeUrl
    } else {
      window.location.href = manageUrl
    }
  }

  const setPrimaryActionText = () => {
    if (license?.plan.type === Constants.PlanType.FREE) {
      primaryActionText = "Upgrade"
      return
    }

    if (cancelAt) {
      primaryActionText = "Renew"
    } else {
      primaryActionText = "Manage"
    }
  }

  const init = async () => {
    try {
      // always load latest
      await licensing.init()
    } catch (e) {
      console.error(e)
      notifications.error(e)
    }
  }

  onMount(async () => {
    await init()
    loaded = true
  })

  $: {
    if (license) {
      setPrimaryActionText()
      setCancelAt()
      setTextRows()
      setDaysRemainingInMonth()

      if (quotaUsage) {
        setMonthlyUsage()
        setStaticUsage()
      }
    }
  }
</script>

{#if loaded}
  <Layout noPadding>
    <Layout noPadding gap="XS">
      <Heading>Usage</Heading>
      <Body>
        <div>Get information about your current usage within Budibase</div>
      </Body>
    </Layout>
    <Divider />
    {#if canManagePlan}
      <Body>
        To upgrade your plan and usage limits visit your
        <Link size="L" on:click={goToAccountPortal}>account</Link>.
      </Body>
    {:else}
      <Body>Contact your account holder to upgrade your plan.</Body>
    {/if}

    <DashCard
      description="YOUR CURRENT PLAN"
      title={planTitle()}
      {primaryActionText}
      primaryAction={accountPortalAccess ? goToAccountPortal : undefined}
      {textRows}
    >
      <div class="content">
        <div class="column">
          <Layout noPadding>
            {#each staticUsage as usage}
              <div class="usage">
                <Usage {usage} warnWhenFull={WARN_USAGE.includes(usage.name)} />
              </div>
            {/each}
          </Layout>
        </div>

        {#if monthlyUsage.length}
          <div class="column">
            <Layout noPadding gap="M">
              <Layout gap="XS" noPadding>
                <Heading size="S">Monthly limits</Heading>
                <div class="detail">
                  <TooltipWrapper tooltip={new Date(quotaReset)}>
                    <Detail size="M">
                      Resets in {daysRemainingInMonth} days
                    </Detail>
                  </TooltipWrapper>
                </div>
              </Layout>
              <Layout noPadding gap="M">
                {#each monthlyUsage as usage}
                  <Usage
                    {usage}
                    warnWhenFull={WARN_USAGE.includes(usage.name)}
                  />
                {/each}
              </Layout>
            </Layout>
          </div>
        {/if}
      </div>
    </DashCard>
  </Layout>
{/if}

<style>
  .content {
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: flex-start;
    gap: 40px;
    flex-wrap: wrap;
  }
  .column {
    flex: 1 1 0;
  }
  .detail :global(.spectrum-Detail) {
    color: var(--spectrum-global-color-gray-700);
    margin-bottom: 5px;
  }
  .detail :global(.icon) {
    margin-bottom: 0;
  }
</style>
