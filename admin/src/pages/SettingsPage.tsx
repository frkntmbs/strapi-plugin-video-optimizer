import React, { useEffect, useState } from "react";
import { Box, Button, Field, Flex, Grid, SingleSelect, SingleSelectOption, TextInput, Typography } from "@strapi/design-system";
import { Check } from "@strapi/icons";
import { Layouts, Page, useFetchClient, useNotification, useRBAC } from "@strapi/strapi/admin";
import { useIntl } from "react-intl";
import { OptimizationResizeFields } from "../components/OptimizationResizeFields";
import { OptimizationVideoFields } from "../components/OptimizationVideoFields";
import { DEFAULT_GLOBAL_SETTINGS, mergeGlobalSettings } from "../defaultGlobalSettings";
import { getTranslationKey, PLUGIN_ID, MAX_CONCURRENT_JOBS_LIMIT, MAX_FFMPEG_THREADS_LIMIT, clampMaxConcurrentJobs, clampMaxFfmpegThreads, type GlobalOptimizationSettings, type OptimizationChoice } from "../pluginId";

const SETTINGS_READ = [{ action: "plugin::video-optimizer.settings.read", subject: null }];
const SETTINGS_UPDATE = [{ action: "plugin::video-optimizer.settings.update", subject: null }];

const CHOICES: OptimizationChoice[] = ["original", "global", "custom"];

export const SettingsPage = () => {
	const { formatMessage } = useIntl();
	const { get, put } = useFetchClient();
	const { toggleNotification } = useNotification();
	const { allowedActions: readActions } = useRBAC(SETTINGS_READ);
	const { allowedActions: updateActions } = useRBAC(SETTINGS_UPDATE);

	const canReadGlobal = readActions.canRead;
	const canUpdateGlobal = updateActions.canUpdate;

	const [globalSettings, setGlobalSettings] = useState<GlobalOptimizationSettings>(DEFAULT_GLOBAL_SETTINGS);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		const load = async () => {
			if (!canReadGlobal) {
				setIsLoading(false);
				return;
			}

			try {
				const { data: settings } = await get(`/${PLUGIN_ID}/settings`);
				setGlobalSettings(mergeGlobalSettings(settings));
			} catch {
				toggleNotification({
					type: "danger",
					message: formatMessage({ id: getTranslationKey("settings.error") }),
				});
			} finally {
				setIsLoading(false);
			}
		};

		load();
	}, [canReadGlobal, formatMessage, get, toggleNotification]);

	const handleSave = async () => {
		if (!canUpdateGlobal) {
			return;
		}

		setIsSaving(true);

		try {
			await put(`/${PLUGIN_ID}/settings`, globalSettings);

			toggleNotification({
				type: "success",
				message: formatMessage({ id: getTranslationKey("settings.saved") }),
			});
		} catch {
			toggleNotification({
				type: "danger",
				message: formatMessage({ id: getTranslationKey("settings.error") }),
			});
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return <Page.Loading />;
	}

	if (!canReadGlobal) {
		return (
			<Page.Main>
				<Page.Title>{formatMessage({ id: getTranslationKey("settings.page.title") })}</Page.Title>
				<Layouts.Header title={formatMessage({ id: getTranslationKey("settings.page.title") })} subtitle={formatMessage({ id: getTranslationKey("settings.page.description") })} />
				<Layouts.Content>
					<Typography textColor="neutral600">{formatMessage({ id: getTranslationKey("settings.global.noPermission") })}</Typography>
				</Layouts.Content>
			</Page.Main>
		);
	}

	return (
		<Page.Main>
			<Page.Title>{formatMessage({ id: getTranslationKey("settings.page.title") })}</Page.Title>
			<Layouts.Header
				title={formatMessage({ id: getTranslationKey("settings.page.title") })}
				subtitle={formatMessage({ id: getTranslationKey("settings.page.description") })}
				primaryAction={
					canUpdateGlobal ? (
						<Button onClick={handleSave} loading={isSaving} startIcon={<Check />} size="S">
							{formatMessage({ id: getTranslationKey("settings.save") })}
						</Button>
					) : undefined
				}
			/>
			<Layouts.Content>
				<Layouts.Root>
					<Flex direction="column" alignItems="stretch" gap={6}>
						<Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
							<Typography variant="delta" tag="h2">
								{formatMessage({ id: getTranslationKey("settings.global.defaultChoiceTitle") })}
							</Typography>
							<Box paddingTop={2} paddingBottom={4}>
								<Typography textColor="neutral600">{formatMessage({ id: getTranslationKey("settings.global.defaultChoiceDescription") })}</Typography>
							</Box>

							<Grid.Root gap={6}>
								<Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
									<Field.Root name="defaultChoice">
										<Field.Label>{formatMessage({ id: getTranslationKey("settings.global.defaultChoice") })}</Field.Label>
										<SingleSelect value={globalSettings.defaultChoice} onChange={(value: OptimizationChoice) => setGlobalSettings((prev) => ({ ...prev, defaultChoice: value }))} disabled={!canUpdateGlobal || isSaving}>
											{CHOICES.map((choice) => (
												<SingleSelectOption key={choice} value={choice}>
													{formatMessage({ id: getTranslationKey(`choice.${choice}`) })}
												</SingleSelectOption>
											))}
										</SingleSelect>
										<Field.Hint>{formatMessage({ id: getTranslationKey("settings.global.defaultChoiceHint") })}</Field.Hint>
									</Field.Root>
								</Grid.Item>
							</Grid.Root>
						</Box>

						<Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
							<Typography variant="delta" tag="h2">
								{formatMessage({ id: getTranslationKey("settings.global.profileTitle") })}
							</Typography>
							<Box paddingTop={2} paddingBottom={4}>
								<Typography textColor="neutral600">{formatMessage({ id: getTranslationKey("settings.global.profileDescription") })}</Typography>
							</Box>

							<Grid.Root gap={6}>
								<OptimizationVideoFields value={globalSettings} onChange={(patch) => setGlobalSettings((prev) => ({ ...prev, ...patch }))} disabled={!canUpdateGlobal || isSaving} namePrefix="global" />

								<OptimizationResizeFields value={globalSettings} onChange={(patch) => setGlobalSettings((prev) => ({ ...prev, ...patch }))} disabled={!canUpdateGlobal || isSaving} namePrefix="global" variant="global" />
							</Grid.Root>
						</Box>

						<Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
							<Typography variant="delta" tag="h2">
								{formatMessage({ id: getTranslationKey("settings.global.concurrencyTitle") })}
							</Typography>
							<Box paddingTop={2} paddingBottom={4}>
								<Typography textColor="neutral600">{formatMessage({ id: getTranslationKey("settings.global.concurrencyDescription") })}</Typography>
							</Box>

							<Grid.Root gap={6}>
								<Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
									<Field.Root name="maxConcurrentJobs">
										<Field.Label>{formatMessage({ id: getTranslationKey("settings.global.maxConcurrentJobs") })}</Field.Label>
										<TextInput
											type="number"
											min={1}
											max={MAX_CONCURRENT_JOBS_LIMIT}
											value={String(globalSettings.maxConcurrentJobs)}
											onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
												setGlobalSettings((prev) => ({
													...prev,
													maxConcurrentJobs: clampMaxConcurrentJobs(Number(event.target.value) || 1),
												}))
											}
											disabled={!canUpdateGlobal || isSaving}
										/>
										<Field.Hint>{formatMessage({ id: getTranslationKey("settings.global.maxConcurrentJobsHint") })}</Field.Hint>
									</Field.Root>
								</Grid.Item>
								<Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
									<Field.Root name="maxFfmpegThreads">
										<Field.Label>{formatMessage({ id: getTranslationKey("settings.global.maxFfmpegThreads") })}</Field.Label>
										<TextInput
											type="number"
											min={1}
											max={MAX_FFMPEG_THREADS_LIMIT}
											value={String(globalSettings.maxFfmpegThreads)}
											onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
												setGlobalSettings((prev) => ({
													...prev,
													maxFfmpegThreads: clampMaxFfmpegThreads(Number(event.target.value) || 1),
												}))
											}
											disabled={!canUpdateGlobal || isSaving}
										/>
										<Field.Hint>{formatMessage({ id: getTranslationKey("settings.global.maxFfmpegThreadsHint") })}</Field.Hint>
									</Field.Root>
								</Grid.Item>
							</Grid.Root>
						</Box>
					</Flex>
				</Layouts.Root>
			</Layouts.Content>
		</Page.Main>
	);
};

export const ProtectedSettingsPage = () => {
	return <SettingsPage />;
};
