import { useEffect, useState } from 'react';
import {
  Page,
  Card,
  IndexTable,
  Badge,
  Button,
  ButtonGroup,
  Text,
  Banner,
  Spinner,
  EmptyState,
} from '@shopify/polaris';
import { adminClient } from '../api/adminClient.js';
import { ModelForm } from './ModelForm.jsx';

export function ModelManager({ onLogout }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editingModel, setEditingModel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const loadModels = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { models: fetched } = await adminClient.get('/models');
      setModels(fetched);
    } catch (err) {
      setLoadError(err.message || 'Failed to load models.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleCreate = async (payload) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await adminClient.post('/models', payload);
      setCreating(false);
      setNotice(`Created "${payload.id}".`);
      await loadModels();
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (payload) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await adminClient.put(`/models/${editingModel.id}`, payload);
      setEditingModel(null);
      setNotice(`Updated "${editingModel.id}".`);
      await loadModels();
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (model) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${model.id}"? Any merchant currently viewing the custom-prompt model picker will stop seeing it immediately.`)) {
      return;
    }
    setDeletingId(model.id);
    try {
      await adminClient.delete(`/models/${model.id}`);
      setNotice(`Deleted "${model.id}".`);
      await loadModels();
    } catch (err) {
      setLoadError(err.message || 'Failed to delete model.');
    } finally {
      setDeletingId(null);
    }
  };

  // Re-runs services/allowedModelsSeedData.js's upsert list (the same thing `npm run seed:models`
  // does via Shell) — for admins on a Render plan without Shell access. Safe to click repeatedly.
  const handleSeed = async () => {
    setSeeding(true);
    setLoadError(null);
    try {
      const { count } = await adminClient.post('/seed-models', {});
      setNotice(`Seeded/updated ${count} models from the built-in catalog.`);
      await loadModels();
    } catch (err) {
      setLoadError(err.message || 'Failed to seed models.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Page
      title="Allowed models"
      subtitle="Models merchants may pick directly for custom-prompt generation. Shared across every merchant — changes take effect immediately."
      primaryAction={{ content: 'New model', onAction: () => setCreating(true) }}
      secondaryActions={[
        { content: 'Re-seed built-in catalog', onAction: handleSeed, loading: seeding },
        { content: 'Sign out', onAction: onLogout },
      ]}
    >
      {notice ? (
        <div style={{ marginBottom: '1rem' }}>
          <Banner tone="success" onDismiss={() => setNotice(null)}>
            <p>{notice}</p>
          </Banner>
        </div>
      ) : null}

      {loadError ? (
        <div style={{ marginBottom: '1rem' }}>
          <Banner tone="critical" title="Couldn't load models" onDismiss={() => setLoadError(null)}>
            <p>{loadError}</p>
          </Banner>
        </div>
      ) : null}

      <Card padding="0">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Spinner accessibilityLabel="Loading models" size="small" />
          </div>
        ) : models.length === 0 ? (
          <EmptyState heading="No allowed models yet" image="">
            <p>Create one so merchants can use custom prompts.</p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: 'model', plural: 'models' }}
            itemCount={models.length}
            headings={[
              { title: 'ID' },
              { title: 'Label' },
              { title: 'FAL model' },
              { title: 'Cost' },
              { title: 'Multi-image' },
              { title: 'Status' },
              { title: 'Actions' },
            ]}
            selectable={false}
          >
            {models.map((model, index) => (
              <IndexTable.Row id={model.id} key={model.id} position={index}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="medium">
                    {model.id}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{model.label}</IndexTable.Cell>
                <IndexTable.Cell>{model.falModel}</IndexTable.Cell>
                <IndexTable.Cell>{model.creditCost}</IndexTable.Cell>
                <IndexTable.Cell>{model.supportsMultiImage ? <Badge tone="info">Yes</Badge> : 'No'}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={model.active ? 'success' : 'critical'}>{model.active ? 'Active' : 'Inactive'}</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ButtonGroup>
                    <Button onClick={() => setEditingModel(model)}>Edit</Button>
                    <Button tone="critical" loading={deletingId === model.id} onClick={() => handleDelete(model)}>
                      Delete
                    </Button>
                  </ButtonGroup>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      {creating ? (
        <ModelForm
          onSubmit={handleCreate}
          onClose={() => {
            setCreating(false);
            setFormError(null);
          }}
          submitting={submitting}
          error={formError}
        />
      ) : null}

      {editingModel ? (
        <ModelForm
          model={editingModel}
          onSubmit={handleUpdate}
          onClose={() => {
            setEditingModel(null);
            setFormError(null);
          }}
          submitting={submitting}
          error={formError}
        />
      ) : null}
    </Page>
  );
}

function formatError(err) {
  if (err.details) {
    const messages = Object.values(err.details).flat();
    if (messages.length > 0) return messages.join(' ');
  }
  return err.message || 'Something went wrong.';
}
