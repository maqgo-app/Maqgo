"""Tests para Wave Guard - filter providers before sending wave 2/3 offers."""
import unittest
from unittest.mock import AsyncMock, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.matching_service import (
    validate_provider_for_wave,
    filter_valid_providers_for_wave,
)


class MockUsersCollection:
    def __init__(self, users_data):
        self.data = users_data

    async def find_one(self, query, *args, **kwargs):
        for doc in self.data:
            match = True
            for key, val in query.items():
                if doc.get(key) != val:
                    match = False
                    break
            if match:
                return doc
        return None


class MockServiceRequestsCollection:
    def __init__(self, requests_data):
        self.data = requests_data

    async def find_one(self, query, *args, **kwargs):
        provider_id = query.get('providerId')
        status = query.get('status')
        if isinstance(status, dict) and '$in' in status:
            for doc in self.data:
                if doc.get('providerId') == provider_id and doc.get('status') in status['$in']:
                    return doc
        return None


class MockDB:
    def __init__(self, users_data=None, requests_data=None):
        self.users = MockUsersCollection(users_data or [])
        self.service_requests = MockServiceRequestsCollection(requests_data or [])


class TestValidateProviderForWave(unittest.IsolatedAsyncioTestCase):
    async def test_valid_provider_passes(self):
        db = MockDB(users_data=[{
            'id': 'p1',
            'isAvailable': True,
            'status': 'active',
        }])

        result = await validate_provider_for_wave(db, 'p1')
        self.assertTrue(result['valid'])
        self.assertIsNone(result.get('reason'))

    async def test_provider_not_found(self):
        db = MockDB(users_data=[])

        result = await validate_provider_for_wave(db, 'nonexistent')
        self.assertFalse(result['valid'])
        self.assertEqual(result['reason'], 'provider_not_found')

    async def test_provider_deleted(self):
        db = MockDB(users_data=[{
            'id': 'p1',
            'isAvailable': True,
            'status': 'deleted',
        }])

        result = await validate_provider_for_wave(db, 'p1')
        self.assertFalse(result['valid'])
        self.assertEqual(result['reason'], 'provider_deleted')

    async def test_provider_not_available(self):
        db = MockDB(users_data=[{
            'id': 'p1',
            'isAvailable': False,
            'status': 'active',
        }])

        result = await validate_provider_for_wave(db, 'p1')
        self.assertFalse(result['valid'])
        self.assertEqual(result['reason'], 'provider_not_available')

    async def test_provider_has_active_service(self):
        db = MockDB(
            users_data=[{
                'id': 'p1',
                'isAvailable': True,
                'status': 'active',
            }],
            requests_data=[{
                'id': 'sr1',
                'providerId': 'p1',
                'status': 'in_progress',
            }]
        )

        result = await validate_provider_for_wave(db, 'p1')
        self.assertFalse(result['valid'])
        self.assertEqual(result['reason'], 'provider_has_active_service')


class TestFilterValidProvidersForWave(unittest.IsolatedAsyncioTestCase):
    async def test_all_valid(self):
        db = MockDB(users_data=[
            {'id': 'p1', 'isAvailable': True, 'status': 'active'},
            {'id': 'p2', 'isAvailable': True, 'status': 'active'},
            {'id': 'p3', 'isAvailable': True, 'status': 'active'},
        ])

        result = await filter_valid_providers_for_wave(db, ['p1', 'p2', 'p3'])
        self.assertEqual(result, ['p1', 'p2', 'p3'])

    async def test_some_invalid(self):
        db = MockDB(users_data=[
            {'id': 'p1', 'isAvailable': True, 'status': 'active'},
            {'id': 'p2', 'isAvailable': False, 'status': 'active'},
            {'id': 'p3', 'isAvailable': True, 'status': 'active'},
        ])

        result = await filter_valid_providers_for_wave(db, ['p1', 'p2', 'p3'])
        self.assertEqual(result, ['p1', 'p3'])

    async def test_all_invalid(self):
        db = MockDB(users_data=[
            {'id': 'p1', 'isAvailable': False, 'status': 'active'},
            {'id': 'p2', 'isAvailable': False, 'status': 'active'},
        ])

        result = await filter_valid_providers_for_wave(db, ['p1', 'p2'])
        self.assertEqual(result, [])

    async def test_filters_provider_with_active_service(self):
        db = MockDB(
            users_data=[
                {'id': 'p1', 'isAvailable': True, 'status': 'active'},
                {'id': 'p2', 'isAvailable': True, 'status': 'active'},
            ],
            requests_data=[{
                'id': 'sr1',
                'providerId': 'p2',
                'status': 'confirmed',
            }]
        )

        result = await filter_valid_providers_for_wave(db, ['p1', 'p2'])
        self.assertEqual(result, ['p1'])


if __name__ == '__main__':
    unittest.main()
